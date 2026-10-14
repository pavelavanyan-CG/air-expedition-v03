// Воздушная экспедиция • «Северная станция» • версия 0.3
// Игровые данные и расчёт последствий. Используется всеми страницами.
// Серверная часть (Supabase RPC) хранит те же данные в базе и выполняет те же проверки.

export const AIRCRAFT = {
  swift:   { name: 'Стриж',    capacity: 7,  cost: 3, time: 1, defense: 0, note: 'Скорость' },
  north:   { name: 'Север',    capacity: 8,  cost: 4, time: 2, defense: 2, note: 'Устойчивость' },
  atlas:   { name: 'Атлас',    capacity: 10, cost: 5, time: 2, defense: 1, note: 'Вместимость' },
  vector:  { name: 'Вектор',   capacity: 8,  cost: 3, time: 3, defense: 1, note: 'Экономия' },
  horizon: { name: 'Горизонт', capacity: 9,  cost: 4, time: 3, defense: 2, note: 'Для пятой команды' },
  taiga:   { name: 'Тайга',    capacity: 7,  cost: 2, time: 3, defense: 1, note: 'Для шестой команды' }
};

export const ROUTES = {
  mountain: { name: 'Горный коридор', cost: 2, time: 2, exposure: 2 },
  valley:   { name: 'Долина',         cost: 3, time: 3, exposure: 1 },
  river:    { name: 'Речной обход',    cost: 2, time: 4, exposure: 0 }
};

export const PRIORITIES = ['Баланс', 'Миссия', 'Безопасность', 'Резерв', 'Скорость'];

export const TRADE_ITEMS = ['resource', 'sensors', 'repair'];
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Три варианта события 1 (условия полёта). Сопоставимая цена ошибки.
export const EVENT1 = [
  {
    id: 'e1a',
    title: 'Погодный фронт',
    text: 'К маршруту смещается фронт. Сохраните курс или перестройте маршрут.',
    options: [
      { id: 'hold',    label: 'Сохранить курс',   hint: 'Потеря безопасности = экспозиция − защита, минимум 0' },
      { id: 'reroute', label: 'Перестроиться',    hint: 'Без потери, но 1 ресурс и +1 время' }
    ]
  },
  {
    id: 'e1b',
    title: 'Ограничение маршрута',
    text: 'Диспетчер ограничивает часть маршрута из-за соседних учений.',
    options: [
      { id: 'hold',    label: 'Ожидать освобождения', hint: '−1 безопасность и +1 время' },
      { id: 'reroute', label: 'Обойти ограничение',    hint: 'Без потери безопасности, но 1 ресурс и +1 время' }
    ]
  },
  {
    id: 'e1c',
    title: 'Техническое предупреждение',
    text: 'На маршруте сообщают о возможной турбулентности.',
    options: [
      { id: 'hold',    label: 'Продолжать осторожно', hint: 'Потеря безопасности = 1 − защита, минимум 0' },
      { id: 'reroute', label: 'Изменить эшелон',      hint: 'Без потери, но 1 ресурс и +1 время' }
    ]
  }
];

// Три варианта события 2 (изменение миссии). Сопоставимая ценность.
export const EVENT2 = [
  {
    id: 'e2a',
    title: 'Срочная медицинская заявка',
    text: 'Соседней площадке нужен медицинский груз.',
    options: [
      { id: 'accept',  label: 'Принять медгруз', hint: '1 место, 1 ресурс, +1 время, +1 миссия' },
      { id: 'decline', label: 'Отказаться',      hint: 'Без изменений' }
    ]
  },
  {
    id: 'e2b',
    title: 'Запрос соседней станции',
    text: 'Соседняя станция просит передать часть ресурса.',
    options: [
      { id: 'accept',  label: 'Передать 1 ресурс', hint: '−1 ресурс, +1 миссия, +1 время' },
      { id: 'decline', label: 'Отказаться',       hint: 'Без изменений' }
    ]
  },
  {
    id: 'e2c',
    title: 'Дефицит наземного ресурса',
    text: 'Наземные службы не могут обслужить все рейсы одновременно.',
    options: [
      { id: 'accept',  label: 'Дождаться своей очереди', hint: '+2 время, без потери ресурса' },
      { id: 'decline', label: 'Оплатить приоритет',       hint: '1 ресурс, без задержки' }
    ]
  }
];

// Расчёт итоговых показателей команды по её решениям.
// Инвентарь с количеством предметов: baseCargo, tradeDirection, tradeItem,
// droppedCargoItem (какой именно груз сняли), event1/2 выбор и id.
export function computeResults(state) {
  const air = AIRCRAFT[state.aircraftId] || { capacity: 0, cost: 0, time: 0, defense: 0 };
  const route = ROUTES[state.routeId] || { cost: 0, time: 0, exposure: 0 };

  let resources = 10 - air.cost - route.cost;
  let time = air.time + route.time;
  let mission = 3;
  let safety = 3;
  let load = 7; // обязательный груз

  // Инвентарь: количество датчиков и ремкомплектов
  let sensorCount = state.baseCargo === 'sensors' ? 1 : 0;
  let repairCount = state.baseCargo === 'repair' ? 1 : 0;

  // Событие 1
  if (state.event1Choice === 'reroute') {
    resources -= 1;
    time += 1;
  } else if (state.event1Choice === 'hold') {
    if (state.event1Id === 'e1a') safety -= Math.max(0, route.exposure - air.defense);
    if (state.event1Id === 'e1b') { safety -= 1; time += 1; }
    if (state.event1Id === 'e1c') safety -= Math.max(0, 1 - air.defense);
  }

  // Сделка: предмет переходит от одного к другому
  if (state.tradeDirection === 'give') {
    time += 1;
    if (state.tradeItem === 'resource') resources -= 1;
    if (state.tradeItem === 'sensors') sensorCount = Math.max(0, sensorCount - 1);
    if (state.tradeItem === 'repair') repairCount = Math.max(0, repairCount - 1);
  } else if (state.tradeDirection === 'receive') {
    time += 1;
    if (state.tradeItem === 'resource') resources += 1;
    if (state.tradeItem === 'sensors') sensorCount += 1;
    if (state.tradeItem === 'repair') repairCount += 1;
  }

  // Снятие конкретного груза на событии 2 (только если он есть)
  if (state.droppedCargoItem === 'sensors' && sensorCount > 0) sensorCount -= 1;
  if (state.droppedCargoItem === 'repair' && repairCount > 0) repairCount -= 1;

  // Пересчёт: место и бонусы по фактическому количеству
  const cargoSlots = sensorCount + repairCount; // каждый допгруз = 1 место
  load += cargoSlots;
  mission += sensorCount;
  safety += repairCount;

  // Событие 2
  if (state.event2Choice === 'accept') {
    if (state.event2Id === 'e2a') { load += 1; resources -= 1; time += 1; mission += 1; }
    if (state.event2Id === 'e2b') { resources -= 1; mission += 1; time += 1; }
    if (state.event2Id === 'e2c') { time += 2; }
  } else if (state.event2Choice === 'decline') {
    if (state.event2Id === 'e2c') resources -= 1;
  }

  const valid = load <= air.capacity && resources >= 0;

  return { resources, time, mission, safety, load, capacity: air.capacity, valid,
           sensorCount, repairCount };
}
