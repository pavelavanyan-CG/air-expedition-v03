// Подключение к Supabase. URL и ключ задаются в config.js (создаётся из config.example.js).

const cfg = window.__AE_CONFIG__;
if (!cfg?.url || !cfg?.key) {
  document.body.innerHTML = '<main class="container"><h1>Требуется настройка Supabase</h1><p>Создайте config.js по инструкции docs/setup-guide.md. Для работы сетевой игры нужны URL проекта и publishable-ключ.</p><p><a href="./index.html">Вернуться на стартовую страницу</a></p></main>';
  throw new Error('CONFIG_NOT_SET');
}
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.109.0');
// Разные роли в одном браузере не должны перезаписывать device_bindings.
// Ведущий сохраняет вход между запусками, каждый командный пульт изолирован по вкладке.
const role = location.pathname.replace(/\.html$/, '').endsWith('/facilitator') ? 'facilitator' : 'team';
export const supabase = createClient(cfg.url, cfg.key, {
  auth: {
    storage: role === 'facilitator' ? localStorage : sessionStorage,
    storageKey: `ae-auth-${role}`,
    detectSessionInUrl: false
  }
});

// Анонимный вход: получаем device_id для RLS. Выполняется до любых защищённых запросов.
export async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error('Не удалось войти: ' + error.message);
}

// Общая подписка на изменения таблицы. Realtime — сигнал перечитать состояние.
export function subscribe(table, onChange) {
  return supabase
    .channel(`ae-${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
    .subscribe();
}

// Публичный снимок: этап, команды, готовность, опубликованные результаты.
export async function fetchPublicSnapshot(sessionCode) {
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('code', sessionCode)
    .single();
  if (!session) return null;

  const [{ data: teams }, { data: readiness }, { data: published }] = await Promise.all([
    supabase.from('teams')
      .select('id, name, draft_position, aircraft_id, status')
      .eq('session_id', session.id),
    supabase.from('team_readiness')
      .select('*')
      .eq('session_id', session.id),
    supabase.from('published_results')
      .select('*')
      .eq('session_id', session.id)
  ]);

  return {
    session,
    teams: teams || [],
    readiness: readiness || [],
    published: published || []
  };
}

// Полный снимок для команды: публичные данные + свои решения и сделки.
export async function fetchTeamSnapshot(sessionCode, teamId) {
  const pub = await fetchPublicSnapshot(sessionCode);
  if (!pub) return null;

  const [{ data: decisions }, { data: trades }] = await Promise.all([
    supabase.from('decisions').select('*').eq('session_id', pub.session.id),
    supabase.from('trades').select('*').eq('session_id', pub.session.id)
  ]);

  return { ...pub, decisions: decisions || [], trades: trades || [] };
}

// Полный снимок для ведущего: все решения, сделки и pin-коды.
export async function fetchFacilitatorSnapshot(sessionCode) {
  const pub = await fetchPublicSnapshot(sessionCode);
  if (!pub) return null;

  const [{ data: decisions }, { data: trades }, { data: teamsFull }] = await Promise.all([
    supabase.from('decisions').select('*').eq('session_id', pub.session.id),
    supabase.from('trades').select('*').eq('session_id', pub.session.id),
    supabase.from('teams').select('*').eq('session_id', pub.session.id)
  ]);

  return { ...pub, decisions: decisions || [], trades: trades || [], teamsFull: teamsFull || [] };
}

export function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 400);
  } catch (e) { /* звук не критичен */ }
}
