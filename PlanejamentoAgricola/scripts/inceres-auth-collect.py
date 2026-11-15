"""Login interativo local e coleta de leitura. Nunca grava senha/cookies/tokens."""
import concurrent.futures
import copy
import http.cookiejar
import json
from pathlib import Path
import queue
import threading
import time
import tkinter as tk
from tkinter import ttk
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tmp' / 'inceres-api'
LOGIN = 'https://dashboard.inceres.com.br/api/login'
STATUS = OUT / 'status.json'
EVENTS = queue.Queue()
STOP = threading.Event()
SESSION = None
OUT.mkdir(parents=True, exist_ok=True)


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    for attempt in range(40):
        try:
            temporary.replace(path)
            break
        except PermissionError:
            if attempt == 39:
                raise
            time.sleep(0.2)


def status(state, **values):
    write_json(STATUS, {'estado': state, **values})
    EVENTS.put(values.get('mensagem', state))


def validate_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc not in {'dashboard.inceres.com.br', 'solo.inceres.com.br'}:
        raise ValueError('Destino não permitido')
    if not parsed.path.startswith('/api/'):
        raise ValueError('Rota não permitida')


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        # Não encaminhar a senha nem a sessão em redirecionamentos.
        raise ValueError('Redirecionamento inesperado; autenticação interrompida')


class Client:
    def __init__(self, cookies=None):
        self.cookies = http.cookiejar.CookieJar()
        for cookie in cookies or []:
            self.cookies.set_cookie(copy.copy(cookie))
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies), SafeRedirect())

    def request(self, url, payload=None):
        validate_url(url)
        if STOP.is_set():
            raise InterruptedError('Coleta interrompida')
        headers = {'Accept': 'application/json', 'User-Agent': 'ControleAgricola-InCeres/1.0',
                   'Origin': 'https://dashboard.inceres.com.br', 'Referer': 'https://dashboard.inceres.com.br/'}
        data = None
        if payload is not None:
            if url != LOGIN:
                raise ValueError('Somente o login admite POST')
            data = json.dumps(payload).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(url, data=data, headers=headers)
        with self.opener.open(request, timeout=45) as response:
            if 'json' not in response.headers.get('Content-Type', ''):
                raise ValueError('Resposta não JSON; verifique a autenticação')
            return json.loads(response.read().decode('utf-8'))


def error_code(error):
    # Não registrar respostas do login, cookies, headers ou objetos de requisição.
    if isinstance(error, urllib.error.HTTPError):
        return f'HTTP {error.code}'
    if isinstance(error, InterruptedError):
        return 'Interrompido pelo usuário'
    if isinstance(error, OSError) and error.filename:
        return f'{type(error).__name__}: {Path(error.filename).name}'
    return type(error).__name__


def collect(client, profile):
    base = f'https://dashboard.inceres.com.br/api/{profile}/me'
    solo = f'https://solo.inceres.com.br/api/{profile}/me'
    years = client.request(base + '/years')
    if not isinstance(years, list) or not all(isinstance(y, str) and len(y) == 9 and y[4] == '-' and y.replace('-', '').isdigit() for y in years):
        raise ValueError('Índice de safras inválido')
    indices, errors, grade_ids = [], [], set()
    for year in years:
        values = client.request(base + '/dashboards/grids-status?cropYear=' + urllib.parse.quote(year))
        if not isinstance(values, list):
            raise ValueError('Índice de grades inválido')
        indices.append({'safra': year, 'grades': values})
        for grade in values:
            identifier = grade.get('amostragemId')
            if type(identifier) is not int:
                raise ValueError('Identificador de grade inválido')
            grade_ids.add(identifier)
        status('coletando', mensagem=f'Índice {year}: {len(values)} grades.', safras_consultadas=len(indices))
    write_json(OUT / 'indices-todas-safras.json', {'formato': 'inceres-indices-v1', 'safras': years, 'indices': indices, 'erros': []})
    payload = {'formato': 'inceres-conta-v1', 'indices': {'safras': years, 'indices': indices, 'erros': []}, 'grades': [], 'erros': errors}
    total_points, total_values = 0, 0
    completed = set()
    previous_path = OUT / 'analises-todas-safras.json'
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))
        previous_ids = {g['amostragemId'] for index in previous['indices']['indices'] for g in index['grades']}
        if previous_ids == grade_ids:
            for entry in previous['grades']:
                if entry.get('completa'):
                    payload['grades'].append(entry)
                    completed.add(entry['grade']['id'])
                    total_points += len(entry['pontos'])
                    total_values += sum(len(point['resultados']) for point in entry['pontos'])
            status('coletando', mensagem=f'Retomando: {len(completed)} grades concluídas preservadas.', grades=len(completed), grades_esperadas=len(grade_ids))
    for identifier in sorted(grade_ids):
        if identifier in completed:
            continue
        if STOP.is_set():
            raise InterruptedError()
        try:
            grade = client.request(solo + f'/cars/{identifier}')
            if grade.get('id') != identifier or not isinstance(grade.get('pieces'), list):
                raise ValueError('Grade inválida')
            row = {'grade': grade, 'talhoes': [], 'pontos': [], 'completa': False}
            payload['grades'].append(row)
            try:
                if not all(type(v) is int for v in [grade['clientId'], grade['farmId'], *grade['areasIds']]):
                    raise ValueError('IDs de área inválidos')
                query = urllib.parse.quote(json.dumps(grade['areasIds']))
                areas = client.request(solo + f"/clients/{grade['clientId']}/farms/{grade['farmId']}/areas?areasId={query}")
                if not isinstance(areas, list):
                    raise ValueError('Talhões inválidos')
                row['talhoes'] = areas
            except Exception as error:
                errors.append({'grade_id': identifier, 'etapa': 'talhoes', 'erro': error_code(error)})

            def point_result(point):
                if type(point.get('id')) is not int:
                    raise ValueError('ID de ponto inválido')
                local_client = Client(client.cookies)
                values = local_client.request(solo + f"/cars/{identifier}/pieces/{point['id']}/pieces_values")
                if not isinstance(values, list) or any(value.get('pieceId') != point['id'] for value in values):
                    raise ValueError('Resultados inválidos')
                return {'ponto': point, 'resultados': values}

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                futures = {pool.submit(point_result, point): point['id'] for point in grade['pieces']}
                for future in concurrent.futures.as_completed(futures):
                    try:
                        point = future.result()
                        row['pontos'].append(point)
                        total_points += 1
                        total_values += len(point['resultados'])
                    except Exception as error:
                        errors.append({'grade_id': identifier, 'ponto_id': futures[future], 'etapa': 'resultados', 'erro': error_code(error)})
                    if STOP.is_set():
                        raise InterruptedError()
            row['pontos'].sort(key=lambda item: item['ponto']['id'])
            row['completa'] = len(row['pontos']) == len(grade['pieces']) and all(any(area['id'] == a for area in row['talhoes']) for a in grade['areasIds'])
        except InterruptedError:
            raise
        except Exception as error:
            errors.append({'grade_id': identifier, 'etapa': 'grade', 'erro': error_code(error)})
        payload['grades_esperadas'] = len(grade_ids)
        payload['completa'] = len(payload['grades']) == len(grade_ids) and not errors and all(g['completa'] for g in payload['grades'])
        write_json(OUT / 'analises-todas-safras.json', payload)
        status('coletando', mensagem=f"{len(payload['grades'])}/{len(grade_ids)} grades; {total_points} pontos; {total_values} valores.",
               grades=len(payload['grades']), grades_esperadas=len(grade_ids), pontos=total_points, valores=total_values, falhas=len(errors))
    status('concluido' if payload['completa'] else 'parcial', mensagem='Consultas encerradas. Arquivo salvo para conferência.',
           grades=len(payload['grades']), pontos=total_points, valores=total_values, falhas=len(errors))


def authenticate(email, password):
    global SESSION
    try:
        status('autenticando', mensagem='Enviando login somente ao InCeres...')
        client = Client()
        client.request(LOGIN, {'email': email, 'password': password, 'confirmPage': False})
        password = None
        profile = next((urllib.parse.unquote(c.value).strip('"') for c in client.cookies if c.name == 'inceresProfileKey'), None)
        if profile not in {'farmers', 'managers', 'consultants', 'samplers', 'field_officers'}:
            raise ValueError('Perfil autenticado não reconhecido')
        client.request(f'https://dashboard.inceres.com.br/api/{profile}/me')
        SESSION = (client, profile)
        status('autenticado', mensagem='Autenticação confirmada. Iniciando consultas de leitura.')
        collect(client, profile)
    except Exception as error:
        status('interrompido' if STOP.is_set() else 'erro', mensagem=f'Não foi possível concluir: {error_code(error)}. Nenhuma tentativa automática de login será feita.')
        EVENTS.put('ENABLE')
    finally:
        password = None


def resume():
    try:
        if SESSION is None:
            raise ValueError('Autenticação necessária')
        collect(*SESSION)
    except Exception as error:
        status('erro', mensagem=f'Consulta interrompida: {error_code(error)}. A sessão permanece na memória para retomada.')
        EVENTS.put('ENABLE')


def main():
    window = tk.Tk()
    window.title('InCeres — autenticação e coleta de análises')
    window.geometry('650x390')
    frame = ttk.Frame(window, padding=24)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='Autenticar diretamente no InCeres', font=('Segoe UI', 14, 'bold')).pack(anchor='w')
    ttk.Label(frame, text='Destino: https://dashboard.inceres.com.br/api/login\nA senha não será salva. A sessão ficará somente na memória.\nApós entrar, serão consultadas as análises de todas as safras.', wraplength=590).pack(anchor='w', pady=(12, 16))
    ttk.Label(frame, text='E-mail do InCeres').pack(anchor='w')
    email = ttk.Entry(frame, width=70)
    email.pack(fill='x', pady=(4, 10))
    ttk.Label(frame, text='Senha').pack(anchor='w')
    password = ttk.Entry(frame, show='•', width=70)
    password.pack(fill='x', pady=(4, 16))
    message = tk.StringVar(value='Aguardando seu login nesta janela. Não envie a senha no chat.')

    def start():
        if SESSION is None and (not email.get().strip() or not password.get()):
            message.set('Preencha o e-mail e a senha.')
            return
        button.configure(state='disabled')
        STOP.clear()
        if SESSION is not None:
            threading.Thread(target=resume, daemon=True).start()
        else:
            secret = password.get()
            password.delete(0, 'end')
            threading.Thread(target=authenticate, args=(email.get().strip(), secret), daemon=True).start()

    button = ttk.Button(frame, text='Entrar e consultar análises', command=start)
    button.pack(anchor='w')
    ttk.Label(frame, textvariable=message, wraplength=590).pack(anchor='w', pady=(15, 0))
    ttk.Button(frame, text='Interromper coleta', command=STOP.set).pack(anchor='e', pady=(10, 0))

    def update():
        while not EVENTS.empty():
            event = EVENTS.get_nowait()
            if event == 'ENABLE':
                button.configure(state='normal')
                if SESSION is not None:
                    button.configure(text='Retomar coleta autenticada')
            else:
                message.set(event)
        window.after(250, update)

    window.protocol('WM_DELETE_WINDOW', lambda: (STOP.set(), window.destroy()))
    status('aguardando_login', mensagem='Janela local pronta para entrada manual do usuário.')
    email.focus_set()
    update()
    window.mainloop()


if __name__ == '__main__':
    main()
