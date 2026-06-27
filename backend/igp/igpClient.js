/**
 * igpClient.js
 * Cliente que replica el flujo real del navegador contra igpmanager.com
 *
 * Flujo:
 *  1. fireUp()  → obtiene CSRF + cookies de sesión anónima
 *  2. login()   → autentica con email+password, devuelve sesión
 *  3. fetch()   → pide datos con la sesión autenticada
 */

const fetch = require('node-fetch');

const BASE       = 'https://igpmanager.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extrae las cookies de Set-Cookie y las devuelve como string para Cookie: */
function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers.map(h => h.split(';')[0]).join('; ');
}

/** Construye un URLSearchParams desde un objeto */
function toForm(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => p.append(k, v));
  return p;
}

// ─── Clase IgpSession ───────────────────────────────────────────────────────

class IgpSession {
  constructor() {
    this.cookies   = '';   // cookie jar acumulativo
    this.csrfName  = '';
    this.csrfToken = '';
    this.userId    = 0;
    this.teamId    = 0;
    this.leagueId  = 0;
    this.managerName = '';
  }

  /** Acumula cookies nuevas sin perder las anteriores */
  _mergeCookies(res) {
    const raw = res.headers.raw()['set-cookie'] || [];
    const nuevo = parseCookies(raw);
    if (!nuevo) return;

    // Merge: actualizar los valores existentes y añadir los nuevos
    const jar = {};
    (this.cookies + '; ' + nuevo).split(';').forEach(pair => {
      const [k, ...v] = pair.trim().split('=');
      if (k) jar[k.trim()] = v.join('=').trim();
    });
    this.cookies = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Cabeceras base para todas las peticiones */
  _headers(extra = {}) {
    return {
      'User-Agent'     : USER_AGENT,
      'Accept'         : 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer'        : `${BASE}/app/`,
      ...(this.cookies ? { 'Cookie': this.cookies } : {}),
      ...extra,
    };
  }

  // ── PASO 1: fireUp ─────────────────────────────────────────────────────────
  /**
   * Inicia la sesión anónima y obtiene el CSRF inicial.
   * Equivale a abrir igpmanager.com/app/ por primera vez.
   */
  async fireUp() {
    const url = `${BASE}/index.php?action=fireUp&addon=igp&ajax=1&jsReply=fireUp&uwv=false`;
    const res  = await fetch(url, { headers: this._headers() });

    this._mergeCookies(res);
    const data = await res.json();

    if (!data.csrf) throw new Error('fireUp: no se recibió CSRF');

    this.csrfName  = data.csrf.name;
    this.csrfToken = data.csrf.token;

    return data;
  }

  // ── PASO 2: login ──────────────────────────────────────────────────────────
  /**
   * Autentica al usuario.
   * @param {string} email
   * @param {string} password
   * @returns {object} datos del manager/team o lanza error
   */
  async login(email, password) {
    // Primero aseguramos que tenemos CSRF fresco
    await this.fireUp();

    const url  = `${BASE}/index.php?action=send&addon=igp&type=login&jsReply=login&ajax=1`;
    const body = toForm({
      email,
      password,
      remember : '1',
      [this.csrfName]: this.csrfToken,
    });

    const res  = await fetch(url, {
      method : 'POST',
      headers: this._headers({
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      }),
      body: body.toString(),
    });

    this._mergeCookies(res);
    const data = await res.json();

    // La API devuelve jsReply=login con el resultado
    // Si hay error, normalmente data.loginErrors o data.user === 0
    if (data.user === 0 || data.user === '0') {
      const errMsg = data.loginErrors
        ? Object.values(data.loginErrors).join(', ')
        : 'Credenciales incorrectas';
      throw new Error(`Login fallido: ${errMsg}`);
    }

    // Actualizar CSRF para las siguientes peticiones
    if (data.csrf) {
      this.csrfName  = data.csrf.name;
      this.csrfToken = data.csrf.token;
    }

    this.userId      = data.user;
    this.teamId      = data.team?._id    || 0;
    this.leagueId    = data.team?._league || 0;
    this.managerName = data.manager?._name || '';

    return {
      userId     : this.userId,
      teamId     : this.teamId,
      leagueId   : this.leagueId,
      managerName: this.managerName,
      teamName   : data.team?._name || '',
      balance    : data.team?._balance || 0,
      tier       : data.team?._tier || null,
    };
  }

  // ── PASO 3: fetchData ──────────────────────────────────────────────────────
  /**
   * Petición genérica de datos autenticada.
   * @param {object} params  Parámetros de query string
   */
  async fetchData(params = {}) {
    const qs = new URLSearchParams({
      action    : 'fetch',
      csrfName  : this.csrfName,
      csrfToken : this.csrfToken,
      _         : Date.now(),
      ...params,
    });

    const url = `${BASE}/index.php?${qs.toString()}`;
    const res  = await fetch(url, { headers: this._headers() });
    this._mergeCookies(res);

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // A veces devuelve HTML si la sesión expiró
      if (text.includes('p=login')) throw new Error('Sesión expirada, vuelve a autenticar');
      throw new Error(`Respuesta inesperada: ${text.substring(0, 200)}`);
    }
  }

  // ── Métodos de datos concretos ─────────────────────────────────────────────

  /** Datos generales de la liga: equipos, standings, calendario */
  async getLeague(leagueId) {
    return this.fetchData({ p: 'league', id: leagueId });
  }

  /** Resultados de una carrera concreta */
  async getRaceResult(raceId, tier = 1, tab = 'race') {
    return this.fetchData({ d: 'result', id: raceId, tier, tab });
  }

  /** Clasificación de pilotos */
  async getDriverStandings(leagueId) {
    return this.fetchData({ d: 'standings', id: leagueId, tab: 'drivers' });
  }

  /** Clasificación de constructores/equipos */
  async getTeamStandings(leagueId) {
    return this.fetchData({ d: 'standings', id: leagueId, tab: 'teams' });
  }

  /** Calendario de la liga */
  async getSchedule(leagueId) {
    return this.fetchData({ d: 'schedule', id: leagueId });
  }

  /** Info del manager */
  async getManager(managerId) {
    return this.fetchData({ p: 'manager', id: managerId });
  }
}

// ─── Factory: crea una sesión autenticada y la devuelve ────────────────────

/**
 * Crea una sesión autenticada de iGP Manager.
 * @param {string} email
 * @param {string} password
 * @returns {IgpSession} sesión lista para usar
 */
async function createSession(email, password) {
  const session = new IgpSession();
  await session.login(email, password);
  return session;
}

/**
 * Verifica que unas credenciales son válidas y pertenecen a una liga concreta.
 * @param {string} email
 * @param {string} password
 * @param {string|number} igpLeagueId  ID de la liga en iGP Manager
 * @returns {{ ok: boolean, error?: string, data?: object }}
 */
async function verificarCredenciales(email, password, igpLeagueId) {
  try {
    const session  = new IgpSession();
    const userData = await session.login(email, password);

    // Comprobar que el usuario pertenece a la liga indicada
    if (igpLeagueId && String(userData.leagueId) !== String(igpLeagueId)) {
      // Puede estar en múltiples ligas; intentar verificar via getLeague
      const leagueData = await session.getLeague(igpLeagueId);
      // Si podemos leer la liga, el usuario tiene acceso
      if (!leagueData || leagueData.error) {
        return { ok: false, error: `La cuenta no pertenece a la liga ${igpLeagueId}` };
      }
    }

    return { ok: true, data: userData };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { IgpSession, createSession, verificarCredenciales };