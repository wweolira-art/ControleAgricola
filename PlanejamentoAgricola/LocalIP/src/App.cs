using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Windows.Forms;
using Microsoft.Win32;

namespace LocalIP {
public sealed class AgentService : ServiceBase {
    Worker worker;
    public AgentService() { ServiceName = Program.ServiceId; CanStop = true; CanShutdown = true; AutoLog = false; }
    protected override void OnStart(string[] args) { worker = new Worker(); worker.Start(); }
    protected override void OnStop() { if (worker != null) { worker.Dispose(); worker = null; } }
    protected override void OnShutdown() { OnStop(); }
    protected override void OnCustomCommand(int command) { if (command == 128 && worker != null) worker.CheckNow(); }
}
public static class Program {
    public const string ServiceId = "LocalIPAgent";
    public static string InstallDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "LocalIP"); } }
    public static string Exe { get { return Path.Combine(InstallDir, "LocalIP.exe"); } }
    [STAThread] public static void Main(string[] args) {
        System.Net.ServicePointManager.SecurityProtocol = System.Net.SecurityProtocolType.Tls12;
        if (args.Contains("--service")) { ServiceBase.Run(new AgentService()); return; }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            if (args.Contains("--uninstall")) { Uninstall(); return; }
            bool setup = args.Contains("--install") || Path.GetFileNameWithoutExtension(Application.ExecutablePath).EndsWith("Setup", StringComparison.OrdinalIgnoreCase);
            Application.Run(new Panel(setup));
        } catch (Exception ex) { MessageBox.Show(ex.Message, "LocalIP", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
    public static bool Installed() { return ServiceController.GetServices().Any(s => s.ServiceName == ServiceId); }
    public static void Sc(string arguments) {
        var info = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "sc.exe"), arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        using (var process = Process.Start(info)) {
            string output = process.StandardOutput.ReadToEnd(); string error = process.StandardError.ReadToEnd();
            process.WaitForExit(); if (process.ExitCode != 0) throw new Exception("Falha ao configurar serviço: " + output + error);
        }
    }
    public static void Stop() {
        using (var svc = new ServiceController(ServiceId)) {
            if (svc.Status == ServiceControllerStatus.Stopped) return;
            if (svc.Status != ServiceControllerStatus.StopPending) svc.Stop();
            svc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(35));
        }
    }
    public static void Start() {
        using (var svc = new ServiceController(ServiceId)) {
            if (svc.Status == ServiceControllerStatus.Running) return;
            svc.Start(); svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
        }
    }
    public static void Install(Settings settings) {
        bool existed = Installed();
        if (existed) Stop();
        Directory.CreateDirectory(InstallDir); Directory.CreateDirectory(Store.Root);
        // Shared data writable only by administrators, SYSTEM and the service account.
        var acl = new DirectorySecurity();
        acl.SetAccessRuleProtection(true, false);
        foreach (var pair in new[] {
            new { Sid = WellKnownSidType.BuiltinAdministratorsSid, Rights = FileSystemRights.FullControl },
            new { Sid = WellKnownSidType.LocalSystemSid, Rights = FileSystemRights.FullControl },
            new { Sid = WellKnownSidType.LocalServiceSid, Rights = FileSystemRights.Modify },
            new { Sid = WellKnownSidType.BuiltinUsersSid, Rights = FileSystemRights.ReadAndExecute }
        }) acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(pair.Sid, null), pair.Rights, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(Store.Root).SetAccessControl(acl);
        if (!String.Equals(Application.ExecutablePath, Exe, StringComparison.OrdinalIgnoreCase)) File.Copy(Application.ExecutablePath, Exe, true);
        Store.Write("config.json", settings);
        try {
            string binary = "\"\\\"" + Exe + "\\\" --service\"";
            if (!existed) Sc("create " + ServiceId + " binPath= " + binary + " start= delayed-auto obj= \"NT AUTHORITY\\LocalService\" DisplayName= \"LocalIP - Monitor de IPv4\"");
            else Sc("config " + ServiceId + " binPath= " + binary + " start= delayed-auto");
            Sc("description " + ServiceId + " \"Verifica e publica o IPv4 a cada 30 minutos.\"");
            Sc("failure " + ServiceId + " reset= 86400 actions= restart/60000/restart/60000/restart/60000");
            using (var key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LocalIP")) {
                key.SetValue("DisplayName", "LocalIP"); key.SetValue("DisplayVersion", "2.0.0");
                key.SetValue("Publisher", "LocalIP"); key.SetValue("InstallLocation", InstallDir);
                key.SetValue("DisplayIcon", Exe); key.SetValue("UninstallString", "\"" + Exe + "\" --uninstall");
                key.SetValue("NoModify", 1); key.SetValue("NoRepair", 1);
            }
            string menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "LocalIP");
            Directory.CreateDirectory(menu);
            Shortcut(Path.Combine(menu, "LocalIP - Painel.lnk"));
            Start();
        } catch {
            if (!existed && Installed()) { try { Stop(); Sc("delete " + ServiceId); } catch { } }
            throw;
        }
    }
    static void Shortcut(string path) {
        Type type = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(type), shortcut = null;
        try {
            shortcut = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
            shortcut.GetType().InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { Exe });
            shortcut.GetType().InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { InstallDir });
            shortcut.GetType().InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        } finally { if (shortcut != null) Marshal.ReleaseComObject(shortcut); Marshal.ReleaseComObject(shell); }
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool MoveFileEx(string source, string destination, int flags);
    static void Uninstall() {
        if (MessageBox.Show("Remover o serviço e o início automático do LocalIP? O histórico e as configurações serão preservados.", "Desinstalar LocalIP", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        if (Installed()) { Stop(); Sc("delete " + ServiceId); }
        Registry.LocalMachine.DeleteSubKeyTree(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\LocalIP", false);
        string menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "LocalIP", "LocalIP - Painel.lnk");
        if (File.Exists(menu)) File.Delete(menu);
        // Only the known executable is removed, never user data or arbitrary directories.
        if (File.Exists(Exe) && !MoveFileEx(Exe, null, 4)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        MessageBox.Show("Serviço removido. O executável será excluído na próxima reinicialização. Histórico preservado em " + Store.Root, "LocalIP");
    }
}
public sealed class Panel : Form {
    readonly bool setup;
    readonly ComboBox adapters = new ComboBox();
    readonly NumericUpDown port = new NumericUpDown();
    readonly Label status = new Label();
    readonly TextBox history = new TextBox();
    readonly CheckBox auto = new CheckBox();
    readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    readonly NotifyIcon tray = new NotifyIcon();
    Settings settings;
    bool busy;
    public Panel(bool installing) {
        setup = installing;
        Text = setup ? "Instalar LocalIP" : "LocalIP — Controle do serviço";
        ClientSize = new Size(740, 600); StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = Size; MaximumSize = Size; MaximizeBox = false; Font = new Font("Segoe UI", 10);
        settings = Store.Read<Settings>("config.json");
        Label title = LabelAt(setup ? "Instalação do monitor de IPv4" : "Monitor de IPv4", 20, 16, 700, 34);
        title.Font = new Font("Segoe UI", 17, FontStyle.Bold);
        LabelAt("Computador: " + Environment.MachineName + "   •   Intervalo: 30 minutos", 20, 58, 700, 26);
        LabelAt("Adaptador de rede", 20, 94, 500, 24);
        adapters.SetBounds(20, 122, 525, 30); adapters.DropDownStyle = ComboBoxStyle.DropDownList; Controls.Add(adapters);
        adapters.Items.Add("Automático — rede com gateway");
        foreach (var address in Store.Addresses()) adapters.Items.Add(address);
        adapters.SelectedIndex = 0;
        for (int i = 1; i < adapters.Items.Count; i++) if (((Address)adapters.Items[i]).Id == settings.AdapterId) { adapters.SelectedIndex = i; break; }
        if (adapters.SelectedIndex == 0 && !String.IsNullOrEmpty(settings.AdapterId)) {
            adapters.Items.Add(new Address { Id = settings.AdapterId, Name = "Adaptador salvo (desconectado)", IP = "indisponível" });
            adapters.SelectedIndex = adapters.Items.Count - 1;
        }
        LabelAt("Porta do site", 565, 94, 150, 24);
        port.SetBounds(565, 122, 150, 30); port.Minimum = 1; port.Maximum = 65535; port.Value = Math.Max(1, Math.Min(65535, settings.Port)); Controls.Add(port);
        auto.Text = "Iniciar automaticamente ao ligar o computador"; auto.SetBounds(20, 163, 695, 28); auto.Checked = true; Controls.Add(auto);
        if (!setup && Program.Installed()) using (var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + Program.ServiceId)) { auto.Checked = key != null && Convert.ToInt32(key.GetValue("Start", 2)) == 2; }
        status.SetBounds(20, 245, 700, 115); Controls.Add(status);
        if (setup) {
            auto.Enabled = false;
            status.Text = "Ao instalar, será criado um serviço com início automático, mesmo sem login.\r\nO primeiro envio ocorre ao iniciar; os seguintes, a cada 30 minutos.\r\nConfira a porta e a rede antes de instalar.";
            ButtonAt("Instalar", 20, 200, 150, delegate { Act(delegate { Program.Install(CurrentSettings()); MessageBox.Show("Instalação concluída. O serviço já está em execução.", "LocalIP"); Process.Start(Program.Exe); Close(); }); });
        } else {
            ButtonAt("Salvar", 20, 200, 100, delegate { Act(delegate {
                settings = CurrentSettings(); Store.Write("config.json", settings);
                Program.Sc("config " + Program.ServiceId + " start= " + (auto.Checked ? "delayed-auto" : "demand"));
                using (var svc = new ServiceController(Program.ServiceId)) if (svc.Status == ServiceControllerStatus.Running) svc.ExecuteCommand(128);
            }); });
            ButtonAt("Iniciar", 130, 200, 100, delegate { Act(Program.Start); });
            ButtonAt("Parar serviço", 240, 200, 140, delegate { Act(Program.Stop); });
            ButtonAt("Verificar agora", 390, 200, 160, delegate { Act(delegate { using (var svc = new ServiceController(Program.ServiceId)) svc.ExecuteCommand(128); }); });
            ButtonAt("Abrir site", 560, 200, 155, delegate { Act(delegate {
                var s = Store.Read<State>("status.json"); System.Net.IPAddress parsed;
                if (!System.Net.IPAddress.TryParse(s.IP, out parsed)) throw new Exception("Nenhum IP detectado ainda.");
                Process.Start("http://" + s.IP + ":" + Store.Read<Settings>("config.json").Port + "/");
            }); });
        }
        LabelAt("Histórico de execução", 20, 367, 700, 25);
        history.SetBounds(20, 395, 695, 150); history.Multiline = true; history.ReadOnly = true; history.ScrollBars = ScrollBars.Vertical; Controls.Add(history);
        LabelAt(setup ? "Requer permissão de administrador. Configuração ativada somente ao instalar." : "Fechar o painel mantém o serviço ativo. Parar vale até iniciar novamente ou reiniciar o PC.", 20, 557, 710, 35);
        if (!setup) {
            tray.Icon = SystemIcons.Application; tray.Text = "LocalIP — abrir painel"; tray.Visible = true;
            var menu = new ContextMenuStrip(); menu.Items.Add("Abrir painel", null, delegate { Show(); WindowState = FormWindowState.Normal; Activate(); });
            menu.Items.Add("Parar serviço", null, delegate { Act(Program.Stop); });
            menu.Items.Add("Fechar painel (serviço continua)", null, delegate { Close(); }); tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { Show(); WindowState = FormWindowState.Normal; Activate(); };
            Resize += delegate { if (WindowState == FormWindowState.Minimized) Hide(); };
            timer.Interval = 2000; timer.Tick += delegate { RefreshState(); }; timer.Start(); RefreshState();
        }
        FormClosed += delegate { timer.Dispose(); tray.Dispose(); };
    }
    Settings CurrentSettings() {
        var item = adapters.SelectedItem as Address;
        return new Settings { ApiUrl = settings.ApiUrl, Port = (int)port.Value, AdapterId = item == null ? "" : item.Id };
    }
    Label LabelAt(string text, int x, int y, int w, int h) { var label = new Label { Text = text }; label.SetBounds(x,y,w,h); Controls.Add(label); return label; }
    void ButtonAt(string text, int x, int y, int width, EventHandler action) { var b = new Button { Text = text }; b.SetBounds(x,y,width,35); b.Click += action; Controls.Add(b); }
    void Act(Action action) {
        if (busy) return; busy = true; UseWaitCursor = true;
        try { action(); } catch (Exception ex) { MessageBox.Show(ex.Message, "LocalIP", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { busy = false; UseWaitCursor = false; if (!setup) RefreshState(); }
    }
    static string Date(string value) { DateTime date; return DateTime.TryParse(value, out date) ? date.ToLocalTime().ToString("dd/MM/yyyy HH:mm:ss") : "—"; }
    void RefreshState() {
        if (busy) return;
        try {
            using (var svc = new ServiceController(Program.ServiceId)) {
                var state = Store.Read<State>("status.json"); bool running = svc.Status == ServiceControllerStatus.Running;
                status.Text = "Serviço: " + (running ? "Em execução" : svc.Status.ToString()) + "   |   IPv4: " + state.IP +
                    "\r\nÚltima tentativa: " + Date(state.LastAttempt) + "   |   Último sucesso: " + Date(state.LastSuccess) +
                    "\r\nPróxima verificação: " + (running ? Date(state.NextCheck) : "—") + "\r\n" + state.Message;
            }
            string path = Path.Combine(Store.Root, "historico.log");
            if (File.Exists(path)) {
                var lines = File.ReadAllLines(path); string text = String.Join(Environment.NewLine, lines.Skip(Math.Max(0, lines.Length - 100)));
                if (history.Text != text) { history.Text = text; history.SelectionStart = history.TextLength; history.ScrollToCaret(); }
            }
        } catch (Exception ex) { status.Text = "Serviço indisponível: " + ex.Message; }
    }
}
}
