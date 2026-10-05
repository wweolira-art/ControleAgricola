using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace LocalIP {
public sealed class Settings {
    public string ApiUrl = "https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/localip/";
    public int Port = 5173;
    public string AdapterId = "";
}
public sealed class State {
    public string IP = "";
    public string Message = "Aguardando primeira verificação.";
    public string LastAttempt = "";
    public string LastSuccess = "";
    public string NextCheck = "";
}
public sealed class Address {
    public string Id, IP, Name;
    public bool Gateway;
    public override string ToString() { return Name + " — " + IP; }
}
public static class Store {
    public static string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "LocalIP");
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(30);
    public static string ConfigPath { get { return Path.Combine(Root, "config.json"); } }
    public static T Read<T>(string name) where T : new() {
        string path = Path.Combine(Root, name);
        return File.Exists(path) ? new JavaScriptSerializer().Deserialize<T>(File.ReadAllText(path)) : new T();
    }
    public static void Write(string name, object value) {
        Directory.CreateDirectory(Root);
        string path = Path.Combine(Root, name), temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        File.WriteAllText(temp, new JavaScriptSerializer().Serialize(value), Encoding.UTF8);
        if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
    }
    public static void Log(string message) {
        Directory.CreateDirectory(Root);
        string path = Path.Combine(Root, "historico.log");
        if (File.Exists(path) && new FileInfo(path).Length > 1024 * 1024) {
            string old = path + ".1";
            if (File.Exists(old)) File.Delete(old);
            File.Move(path, old);
        }
        File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " | " + message + Environment.NewLine, Encoding.UTF8);
    }
    public static List<Address> Addresses() {
        var result = new List<Address>();
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces()) {
            if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback || nic.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
            var props = nic.GetIPProperties();
            foreach (var a in props.UnicastAddresses) {
                string ip = a.Address.ToString();
                if (a.Address.AddressFamily != AddressFamily.InterNetwork || IPAddress.IsLoopback(a.Address) || ip.StartsWith("169.254.") || ip == "0.0.0.0") continue;
                result.Add(new Address { Id = nic.Id, IP = ip, Name = nic.Name, Gateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && g.Address.ToString() != "0.0.0.0") });
            }
        }
        return result.OrderByDescending(a => a.Gateway).ThenBy(a => a.Name).ThenBy(a => a.IP).ToList();
    }
}
public sealed class Api {
    readonly Uri root;
    readonly CancellationToken token;
    readonly int timeout;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    public Api(string url, CancellationToken cancellation, int timeoutMs = 20000) {
        root = new Uri(url.TrimEnd('/') + "/"); token = cancellation; timeout = timeoutMs;
        if (root.Scheme != "https" && !(root.Scheme == "http" && root.IsLoopback)) throw new Exception("A API precisa usar HTTPS.");
    }
    Uri SafeUri(string link) {
        var uri = new Uri(root, link);
        if (uri.Scheme != root.Scheme || uri.Host != root.Host || uri.Port != root.Port || !uri.AbsolutePath.StartsWith(root.AbsolutePath, StringComparison.Ordinal)) throw new Exception("Link fora da API configurada.");
        return uri;
    }
    string Request(string method, Uri uri, object body) {
        token.ThrowIfCancellationRequested();
        var req = (HttpWebRequest)WebRequest.Create(uri);
        req.Method = method; req.Timeout = timeout; req.ReadWriteTimeout = timeout;
        req.AllowAutoRedirect = false; req.Accept = "application/json";
        using (token.Register(req.Abort)) {
            if (body != null) {
                byte[] bytes = Encoding.UTF8.GetBytes(json.Serialize(body));
                req.ContentType = "application/json; charset=utf-8"; req.ContentLength = bytes.Length;
                using (var stream = req.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            }
            using (var response = (HttpWebResponse)req.GetResponse()) {
                if ((int)response.StatusCode < 200 || (int)response.StatusCode >= 300) throw new Exception("Resposta HTTP " + (int)response.StatusCode);
                using (var reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd();
            }
        }
    }
    static IEnumerable<Dictionary<string, object>> Items(object value) {
        var array = value as System.Collections.IEnumerable;
        if (array == null) yield break;
        foreach (var item in array) { var dict = item as Dictionary<string, object>; if (dict != null) yield return dict; }
    }
    static string Value(Dictionary<string, object> d, string key) { object v; return d.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : ""; }
    static string Link(Dictionary<string, object> d, string rel) {
        object links;
        if (d.TryGetValue("links", out links)) foreach (var item in Items(links)) if (Value(item, "rel") == rel) return Value(item, "href");
        return "";
    }
    static bool IsActive(string value) { return String.Equals(value.Trim(), "S", StringComparison.OrdinalIgnoreCase); }
    static bool SameServer(Dictionary<string, object> row, string server) {
        return String.Equals(Value(row, "servidor").Trim(), server.Trim(), StringComparison.OrdinalIgnoreCase);
    }
    Uri RowUri(Dictionary<string, object> row) {
        string self = Link(row, "self");
        if (self.Length == 0) {
            string id = Value(row, "id");
            if (id.Length == 0) id = Value(row, "rowid");
            if (id.Length == 0) throw new Exception("Registro encontrado sem link self ou identificador. Nenhuma linha inserida.");
            self = Uri.EscapeDataString(id);
        }
        return SafeUri(self);
    }
    public string Publish(string server, string ip, int port) {
        var all = new List<Dictionary<string, object>>();
        Uri page = root;
        var visited = new HashSet<string>();
        while (page != null) {
            if (!visited.Add(page.AbsoluteUri) || visited.Count > 1000) throw new Exception("Paginação inválida na API; envio cancelado.");
            var data = json.Deserialize<Dictionary<string, object>>(Request("GET", page, null));
            object rows;
            if (data == null || !data.TryGetValue("items", out rows) || !(rows is System.Collections.IEnumerable) || rows is string) throw new Exception("A API não retornou uma coleção ORDS válida.");
            foreach (var row in Items(rows)) all.Add(row);
            string next = Link(data, "next");
            object more;
            if (next.Length == 0 && data.TryGetValue("hasMore", out more) && Convert.ToBoolean(more)) throw new Exception("API indicou mais registros sem link de paginação.");
            page = next.Length == 0 ? null : SafeUri(next);
        }
        var matches = new List<Dictionary<string, object>>();
        var othersActive = new List<Dictionary<string, object>>();
        foreach (var row in all) {
            if (SameServer(row, server)) matches.Add(row);
            else if (IsActive(Value(row, "ativo"))) othersActive.Add(row);
        }
        bool inserted = matches.Count == 0;
        if (inserted) {
            Request("POST", root, new Dictionary<string, object> {
                { "servidor", server }, { "numeroip", ip }, { "porta", port }, { "ativo", "S" }
            });
        } else {
            foreach (var row in matches) {
                Request("PUT", RowUri(row), new Dictionary<string, object> {
                    { "servidor", Value(row, "servidor").Length == 0 ? server : Value(row, "servidor") },
                    { "numeroip", ip },
                    { "porta", port },
                    { "ativo", "S" }
                });
            }
        }
        foreach (var row in othersActive) {
            int otherPort;
            int.TryParse(Value(row, "porta"), out otherPort);
            Request("PUT", RowUri(row), new Dictionary<string, object> {
                { "servidor", Value(row, "servidor") },
                { "numeroip", Value(row, "numeroip") },
                { "porta", otherPort },
                { "ativo", "N" }
            });
        }
        return inserted ? "Cadastro enviado à API." : "IP e porta atualizados na API.";
    }
}
public sealed class Worker : IDisposable {
    readonly CancellationTokenSource cancel = new CancellationTokenSource();
    readonly AutoResetEvent wake = new AutoResetEvent(false);
    Thread thread;
    public void Start() { thread = new Thread(Run) { IsBackground = true }; thread.Start(); }
    public void CheckNow() { wake.Set(); }
    void Run() {
        State state;
        try { state = Store.Read<State>("status.json"); } catch { state = new State(); }
        while (!cancel.IsCancellationRequested) {
            try {
                if (!File.Exists(Store.ConfigPath)) throw new Exception("Configure a porta e a rede no painel LocalIP.");
                var config = Store.Read<Settings>("config.json");
                if (config.Port < 1 || config.Port > 65535) throw new Exception("Porta inválida.");
                state.LastAttempt = DateTime.Now.ToString("o"); state.NextCheck = "";
                var address = Store.Addresses().FirstOrDefault(a => String.IsNullOrEmpty(config.AdapterId) || a.Id == config.AdapterId);
                if (address == null) throw new Exception("Adaptador desconectado ou sem IPv4. Nova tentativa em 30 minutos.");
                state.IP = address.IP; state.Message = "Enviando..."; Store.Write("status.json", state);
                state.Message = new Api(config.ApiUrl, cancel.Token).Publish(Environment.MachineName, address.IP, config.Port);
                state.LastSuccess = DateTime.Now.ToString("o");
            } catch (Exception ex) {
                if (cancel.IsCancellationRequested) break;
                state.Message = "Falha: " + ex.Message;
            }
            state.NextCheck = DateTime.Now.Add(Store.Interval).ToString("o");
            try { Store.Write("status.json", state); Store.Log(state.Message + " IPv4: " + state.IP); } catch { /* Retry on next cycle if disk is temporarily unavailable. */ }
            if (WaitHandle.WaitAny(new WaitHandle[] { cancel.Token.WaitHandle, wake }, Store.Interval) == 0) break;
        }
        state.Message = "Serviço parado."; state.NextCheck = "";
        try { Store.Write("status.json", state); Store.Log(state.Message); } catch { }
    }
    public void Dispose() {
        cancel.Cancel(); wake.Set();
        if (thread != null && !thread.Join(25000)) throw new TimeoutException("O serviço ainda está encerrando a requisição.");
        wake.Dispose(); cancel.Dispose();
    }
}
}
