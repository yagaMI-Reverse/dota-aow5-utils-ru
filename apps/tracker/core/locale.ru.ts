/**
 * Russian for the tracker's own words.
 *
 * Item, room and recipe names are absent on purpose: they arrive from the
 * addon's data and are matched against the lines Dota writes, so translating
 * them would break the match and leave the panel empty. What is here is the
 * chrome — the labels, the buttons and the tooltips the tracker writes itself.
 *
 * Card labels are kept at or near the length of the English they replace. The
 * cards sit three to a row and the label is truncated, so a long one is not a
 * broken layout, but it is an unreadable one.
 */
export const ru: Record<string, string> = {
  // Панели и общее
  'Settings': 'Настройки',
  'History': 'История',
  'Session': 'Сессия',
  'About': 'О программе',
  'Appearance': 'Внешний вид',
  'Optimization': 'Оптимизация',
  'Sounds': 'Звуки',
  'Cancel': 'Отмена',
  'Refresh': 'Обновить',
  'Choose': 'Выбрать',
  'Choose a file': 'Выберите файл',
  'Not set': 'Не задано',
  'Clear all': 'Очистить всё',
  'Download': 'Скачать',

  // Заголовок окна и кнопки
  'Close this window': 'Закрыть окно',
  'Quit the tracker': 'Выйти из трекера',
  'Resize overlay': 'Изменить размер',
  'Collapse to the summary cards': 'Свернуть до карточек',
  'Expand to the full readout': 'Развернуть панель целиком',

  // Строка состояния: предлог отдельно, название комнаты приходит из игры
  'In ': 'В ',
  'At ': 'Карта ',
  'hideout': 'убежище',
  'Runs finished this session': 'Забегов завершено за сессию',

  // Карточки HUD — держать короткими, три в ряд
  'HUD cards': 'Карточки',
  'session time': 'время сессии',
  'session gold': 'золото сессии',
  'session best': 'топ сессии',
  'current time': 'время комнаты',
  'current gold': 'золото комнаты',
  'gold per map': 'среднее золото',
  'time per map': 'среднее время',
  'hourly gold': 'золото в час',
  'picked up': 'собрано',
  'Per room': 'За комнату',

  // Подсказки карточек
  'Since this session started — the hideout and the loading screens count':
    'С начала сессии — убежище и загрузки тоже считаются',
  'Everything this session has dropped, priced the way the list is':
    'Всё, что выпало за сессию, по ценам из списка',
  'The item worth most this session': 'Самый дорогой предмет за сессию',
  'How long you have been in the room you are standing in':
    'Сколько времени вы в текущей комнате',
  'What the room below has dropped, priced the way the list is':
    'Что выпало в комнате ниже, по ценам из списка',
  'Mean gold of the rooms you have finished this session — the open one does not count yet':
    'Среднее золото завершённых комнат за сессию — текущая пока не в счёт',
  'Mean time of the rooms you have finished this session':
    'Среднее время завершённых комнат за сессию',
  'Gold per hour, counting only the time you spent inside rooms':
    'Золото в час, считая только время внутри комнат',

  // Управление сессией
  'Start the session clock': 'Запустить часы сессии',
  'Start the clock on the first room': 'Запустить часы с первой комнаты',
  'Pause the session clock — loot still counts':
    'Пауза часов сессии — добыча продолжает считаться',
  'Start a new session — the numbers go back to zero':
    'Начать новую сессию — числа обнулятся',
  'Died here — drop this room’s loot from the session, keep the time':
    'Погиб здесь — убрать добычу этой комнаты, время оставить',
  'Undo — count the last room again': 'Вернуть — снова засчитать последнюю комнату',

  // Списки и пустые состояния
  'Nothing dropped.': 'Ничего не выпало.',
  'Nothing dropped in here yet.': 'Здесь пока ничего не выпало.',
  'None of your tracked items in this room yet.':
    'Отслеживаемых предметов в этой комнате пока нет.',
  'No runs.': 'Забегов нет.',
  'No item by that name.': 'Предмета с таким именем нет.',
  'Nothing craftable by that name. Try “any item”.':
    'Ничего собираемого с таким именем. Попробуйте «любой предмет».',
  'Loading recipes…': 'Загружаю рецепты…',
  'Reading the archive…': 'Читаю архив…',
  'Search by name…': 'Поиск по названию…',
  'Search items…': 'Поиск предметов…',
  'Search recipes…': 'Поиск рецептов…',
  'Search an item to price…': 'Найдите предмет, чтобы задать цену…',
  'Search an item to bind a sound…': 'Найдите предмет, чтобы назначить звук…',

  // История
  'Delete all?': 'Удалить всё?',
  'Delete every archived session. The session on screen keeps counting.':
    'Удалить все сохранённые сессии. Текущая на экране продолжит считаться.',
  'Delete the ticked sessions and the runs recorded under them.':
    'Удалить отмеченные сессии вместе с их забегами.',

  // Цены и отслеживание
  'Item prices': 'Цены предметов',
  'Tracked items': 'Отслеживаемые предметы',
  'Trader pays half': 'Торговец платит половину',
  'What it would fetch without a price of its own':
    'Сколько дал бы торговец без своей цены',
  'Remove this price — back to the table price':
    'Убрать свою цену — вернуть табличную',

  // Рецепты
  'Add a recipe or an item': 'Добавить рецепт или предмет',
  'Craft this instead — give it a line of its own':
    'Собирать это — отдельной строкой',
  'Stop making this — count it as a material instead':
    'Больше не собирать — считать материалом',
  'One more': 'Ещё один',
  'One fewer': 'На один меньше',
  'Remove': 'Убрать',

  // Звуки
  'Play a sound on drops': 'Звук при выпадении',
  'Play it': 'Прослушать',
  'Volume': 'Громкость',
  'Cut long sounds': 'Обрезать длинные звуки',
  'Cut after': 'Обрезать после',
  'Unbind': 'Отвязать',

  // Лог
  'Console log': 'Консольный лог',
  'Keep the log small': 'Держать лог маленьким',
  'Trim now': 'Обрезать сейчас',
  'Unreadable lines': 'Нечитаемые строки',
  'Nothing in it but tracker lines already.': 'В нём и так только строки трекера.',
  'No log there yet. Dota writes it when you launch with -con_logfile.':
    'Лога там пока нет. Dota создаст его при запуске с -con_logfile.',
  'Dota writes its client console to a file when you launch it with':
    'Dota пишет консоль клиента в файл, если запустить её с',

  // Вид
  'Background': 'Фон',
  'Transparent background': 'Прозрачный фон',
  'UI scale': 'Масштаб',
  'Let the game show through the panel. The readout stays solid either way.':
    'Пусть игра просвечивает сквозь панель. Числа остаются читаемыми в любом случае.',

  // Обновления
  'Check for updates': 'Проверить обновления',
  'Asking GitHub…': 'Спрашиваю GitHub…',
  'This is the newest build.': 'Это самая свежая сборка.',
  'Restart and update': 'Перезапустить и обновить',
  'Only an installed build can update itself.':
    'Обновляться умеет только установленная сборка.',

  // Строки со значением: {0} — подстановка
  '{0}, {1} of {2}': '{0}, {1} из {2}',
  'Price for {0}': 'Цена: {0}',
  'Remove your price for {0}': 'Убрать свою цену: {0}',
  'Choose a sound for {0}': 'Звук для {0}',
  'Play {0}': 'Прослушать {0}',
  'Unbind {0}': 'Отвязать: {0}',
  'Stop tracking {0}': 'Не отслеживать {0}',
  'One more {0}': 'Ещё один: {0}',
  'Craft {0} instead': 'Собирать {0} вместо этого',
  'Do not craft {0}': 'Не собирать {0}',
  'Sort by {0}': 'Сортировать по: {0}',
  'Select the session of {0}': 'Выбрать сессию от {0}',
  'Remove {0}': 'Убрать {0}',
  'One fewer {0}': 'На один меньше: {0}',
  'Your price. Without it this would fetch {0}g.':
    'Ваша цена. Без неё это стоило бы {0} золота.',
  'Delete {0}?': 'Удалить {0}?',
  'Delete {0}': 'Удалить {0}',
  'Downloading {0}… {1}%': 'Скачиваю {0}… {1}%',
  'Could not check: {0}': 'Не удалось проверить: {0}',

  // Карточки там, где их выбирают: полное имя и фраза. Здесь длина свободнее,
  // чем на самой карточке — Настройки читают внимательно и один раз.
  'Session time': 'Время сессии',
  'Session gold': 'Золото сессии',
  'Session best': 'Лучшее за сессию',
  'Current time': 'Время в комнате',
  'Current gold': 'Золото в комнате',
  'Gold per map': 'Золото за комнату',
  'Time per map': 'Время на комнату',
  'Hourly gold': 'Золото в час',
  'Since the session started. The hideout and the loading screens count.':
    'С начала сессии. Убежище и загрузочные экраны тоже считаются.',
  'Everything this session has dropped, at your prices.':
    'Всё, что выпало за сессию, по вашим ценам.',
  'The single most valuable pile, said in its icon.':
    'Самая дорогая стопка — её иконка и есть подпись.',
  'How long you have been in the room you are standing in.':
    'Сколько времени вы в текущей комнате.',
  'What the room below has dropped, priced the way the list is.':
    'Что выпало в комнате ниже, по ценам из списка.',
  'Mean gold of the rooms you have finished. The open one does not count until it does.':
    'Среднее золото завершённых комнат. Текущая не в счёт, пока не закончится.',
  'Mean clear time of the rooms you have finished.':
    'Среднее время зачистки завершённых комнат.',
  'Counting only the time spent inside rooms, not the hideout.':
    'Считается только время внутри комнат, без убежища.',

  // Диалоги выбора файла — главный процесс
  'Choose a sound': 'Выберите звук',
  'Choose the Dota console log': 'Выберите консольный лог Dota',
  'Audio': 'Аудио',
  'All files': 'Все файлы',

  // Трей
  'Quit': 'Выход',
  'Interactive: {0}': 'Управление: {0}',
  'Show {0}': 'Показать: {0}',
  'Hide {0}': 'Скрыть: {0}',
  'overlay-name-farm': 'панель фарма',
  'overlay-name-recipe': 'рецепты',
  'overlay-name-history': 'история',
  'overlay-name-settings': 'настройки',
  'overlay-name-market': 'линза биржи',

  // Диалог обновления
  'Update the tracker': 'Обновить трекер',
  'Not now': 'Не сейчас',
  'Update to {0}?': 'Обновить до {0}?',
  'update-detail':
    'Сначала вернитесь в убежище. Трекер закроется и откроется заново на новой версии, ' +
    'и всё это время он не сможет следить за игрой.\n\n' +
    'Завершённые забеги уже в архиве. Тот, в котором вы стоите, — нет, и итоги сессии ' +
    'начнутся с нуля.\n\n' +
    'Настройки, цены и история сохранятся.',

  // Длинные подсказки в Настройках
  'The trader buys at half the table price, so value every unpriced drop at half. Prices you set below are used exactly as you set them, either way.':
    'Торговец покупает за половину табличной цены, поэтому всё без своей цены считается вполовину. Цены, заданные ниже, применяются ровно так, как вы их задали.',
  'Rings once per pickup of a bound item. Crimson Heart comes bound to the jackpot sound; unbind it and it stays unbound.':
    'Звучит один раз на каждый подбор привязанного предмета. Crimson Heart привязан к звуку джекпота изначально; отвяжете — останется отвязанным.',
  'Fade the sound out after a few seconds instead of playing the whole file.':
    'Плавно приглушать звук через несколько секунд вместо проигрывания файла целиком.',
  'A session begins paused, so the tracker can sit open while Dota loads without counting that as farming. With this on, walking into a room presses play for you. A pause you press mid-session still holds until the next room.':
    'Сессия начинается на паузе, чтобы трекер мог висеть открытым, пока грузится Dota, и это не считалось фармом. С этой галкой вход в комнату сам нажимает «пуск». Пауза, поставленная вами посреди сессии, всё равно держится до следующей комнаты.',
  'Ctrl +/− also changes the scale, and Ctrl+Alt +/− does it without clicking in first. The chevron collapses the panel to its cards, which are as tall as they are — so there the corner drags width only. Expanded, it keeps the height you drag it to.':
    'Ctrl +/− тоже меняет масштаб, а Ctrl+Alt +/− делает это, не заходя в панель мышью. Уголок сворачивает панель до карточек, а их высота фиксирована — там угол тянет только ширину. В развёрнутом виде высота остаётся такой, какой вы её растянули.',
  'The tables carry what an item sells for, which is not always what it is worth to you. Set your own and every gold figure follows it: g/hr, the session total, the loot list and the archive alike. Items you say nothing about keep the table price.':
    'В таблицах записано, за сколько предмет продаётся, а это не всегда то, сколько он стоит для вас. Задайте свою цену — и за ней пойдут все числа: золото в час, итог сессии, список добычи и архив. Предметы, о которых вы ничего не сказали, останутся с табличной ценой.',
  'Pin the items you care about and the expanded readout lists only those, with a session total to match. With none pinned, everything picked up is listed. History always records the lot, whatever is pinned here.':
    'Закрепите нужные предметы — и развёрнутая панель покажет только их, с отдельным итогом за сессию. Если не закреплено ничего, перечисляется всё подобранное. История пишет всё в любом случае, что бы здесь ни было закреплено.',
  'Updates are for an installed build. This one runs from the source tree, so it updates the way the source tree does.':
    'Обновления — для установленной сборки. Эта запущена из исходников, так что и обновляется вместе с ними.',
  'The game emitted tracker lines this build could not use — most likely a schema change.':
    'Игра выдала строки трекера, которые эта сборка не смогла разобрать — скорее всего, поменялся формат.',
  'Point the tracker at that file and it reads the game’s own tracker lines as they land.':
    'Укажите трекеру этот файл, и он будет читать строки аддона по мере их появления.',

  // История
  'Nothing recorded yet. A session lands here once its first run finishes — the run you are in is still the overlay’s.':
    'Пока ничего не записано. Сессия попадает сюда, когда завершится её первый забег, — тот, в котором вы сейчас, ещё принадлежит панели.',
  'session total': 'итог сессии',

  // Доходность комнат
  'Rooms by the minute': 'Комнаты по доходности',
  '{0} rooms': 'комнат: {0}',
  'room': 'комната',
  'g/min': 'зол/мин',
  'time': 'время',
  '{0} of these ended in a death': 'из них смертью закончились: {0}',
  'Priced at today’s prices, deaths included — they cost the time either way.':
    'По сегодняшним ценам. Смерти учтены — время они отнимают в любом случае.',

  'runs': 'забегов',
  'active': 'в деле',
  'gold': 'золото',

  // Прогноз по рецептам
  'about one every {0} h': 'примерно один за {0} ч',
  'about {0} an hour': 'примерно {0} в час',
  '{0} {1}/{2} — click to tick off': '{0} {1}/{2} — нажмите, чтобы отметить',
  '~{0} m': '~{0} мин',
  '~{0} h {1} m': '~{0} ч {1} мин',
  'At the rate these have dropped for you so far':
    'По темпу, с каким они выпадали у вас до сих пор',

  // Пикер предметов
  'recipes': 'рецепты',
  'any item': 'любой предмет',

  // Автонастройка
  'The HUD needs one card; turn another on to free this one.':
    'Панели нужна хотя бы одна карточка; включите другую, чтобы освободить эту.',
  'Language': 'Язык',

  // Горячая клавиша
  'Click-through hotkey': 'Клавиша перехвата мыши',
  'Press a combination…': 'Нажмите сочетание…',
  'Back to the default': 'Вернуть стандартную',
  'Esc cancels. A modifier is required — Ctrl, Alt or Shift.':
    'Esc — отмена. Нужен модификатор: Ctrl, Alt или Shift.',
  'The key that lets the mouse reach the panel. Held by the whole system, so another program can own it.':
    'Клавиша, которая отдаёт мышь панели. Регистрируется на всю систему, так что её может занять другая программа.',
  '{0} is taken by something else': '{0} занято другой программой',

  'Setup': 'Настройка',

  // Звук находки
  'Ring on a golden find': 'Звук при супернаходке',
  'Salvage verdicts and deep-discount listings play a short sound, once per lot.':
    'Разборные вердикты и лоты с глубокой скидкой играют короткий звук — один раз на лот.',
  'Find volume': 'Громкость находки',
  'Ring below market by': 'Звенеть при скидке от',
  'Choose a find sound': 'Выбрать звук находки',
  'Back to the built-in': 'Вернуть встроенный',

  // Кот-эвент
  'Event cat': 'Кот-эвент',
  'Meow when the event cat appears': 'Мяукать, когда появляется кот-эвент',
  'Watches the minimap for one green marker more than the room normally shows. The first visits to each room teach it the normal count, so trust the ring from the second run on. Works while the Exchange lens is on.':
    'Следит за миникартой: на один зелёный маркер больше обычного — значит, заспавнился кот. Первые заходы в комнату линза запоминает норму, так что верить сигналу стоит со второго захода. Работает, пока включена линза биржи.',
  'Meow volume': 'Громкость мяуканья',
  'Choose a meow': 'Выбрать мяуканье',
  'No meow': 'Убрать звук',
  'Silent until a sound file is chosen.': 'Молчит, пока не выбран файл со звуком.',

  // Ручной учёт материалов (купленное на рынке)
  'Count one bought': 'Засчитать покупку',
  'Bought on the market: click +1, right-click −1': 'Куплено на рынке: клик +1, ПКМ −1',

  // Поиск по настройкам
  'Search the settings…': 'Поиск по настройкам…',
  'Clear the search': 'Очистить поиск',
  'Nothing matches': 'Ничего не нашлось',

  // Линза биржи
  'Exchange lens': 'Линза биржи',
  'Badge Exchange listings with a verdict': 'Помечать лоты биржи вердиктом',
  'Reads the Exchange window off the screen while it is open and marks each row against your prices: green is a bargain, red is an overcharge. Screen capture only — the game itself is never touched.':
    'Читает окно биржи с экрана, пока оно открыто, и помечает каждую строку относительно ваших цен: зелёное — выгодно, красное — переплата. Только снимок экрана — сама игра не затрагивается.',
  '{0}% — take it': '{0}% — брать',
  '{0}% — fair': '{0}% — по рынку',
  '+{0}% — pass': '+{0}% — дорого',
  'lens: {0} lines, {1} rows': 'линза: строк {0}, лотов {1}',
  'salvage ≥+{0}%': 'разбор ≥+{0}%',
  'salvage {0}+ leg ess +{1}%': 'разбор: {0}+ лег.эсс, +{1}%',
  'learning {0}/3': 'учу рынок {0}/3',
  'market {0}–{1}': 'рынок {0}–{1}',
  'salvage {0}+ myth ess +{1}%': 'разбор: {0}+ миф.эсс, +{1}%',

  // Журнал рынка
  'Market prices the lens has learned': 'Рынок: выученные цены',
  'Search all items…': 'Поиск по всем предметам…',
  'your price': 'своя цена',
  'item': 'предмет',
  'median': 'медиана',
  'seen': 'н.',
  'range': 'разброс',
  'Filled in by the Exchange lens as you browse. A wide range is the trade: catch the low end, relist at the median.':
    'Заполняется линзой, пока вы листаете биржу. Широкий разброс — это и есть заработок: ловите нижний край, выставляйте по медиане.',
  'Checking…': 'Проверяю…',
  'Not found': 'Не найдено',
  'Dota 2': 'Dota 2',
  'Console tuning': 'Настройка консоли',
  'autoexec.cfg is in place': 'autoexec.cfg на месте',
  'autoexec.cfg is missing': 'autoexec.cfg отсутствует',
  'another autoexec.cfg is there — it will be backed up':
    'там чужой autoexec.cfg — будет сохранена копия',
  'Log file': 'Лог-файл',
  'Launch option': 'Параметр запуска',
  'Steam is open — close it to check and set this':
    'Steam запущен — закройте его, чтобы проверить и задать',
  '-con_logfile points at the file': '-con_logfile указывает на этот файл',
  '-con_logfile is not set': '-con_logfile не задан',
  'Display mode': 'Режим экрана',
  'Exclusive fullscreen hides every overlay — switch Dota to windowed or borderless':
    'Полноэкранный режим закрывает любой оверлей — переключите Dota в оконный или безрамочный',
  'Borderless window': 'Безрамочное окно',
  'Windowed': 'Оконный режим',
  'Steam account': 'Аккаунт Steam',
  '{0} — signed in': '{0} — сейчас в сети',
  'Set it all up': 'Настроить всё',
  'Working…': 'Настраиваю…',
  'Everything is ready.': 'Всё готово.',
  '{0}: done': '{0}: сделано',
  '{0}: already fine': '{0}: и так в порядке',
  '{0}: failed ({1})': '{0}: не вышло ({1})',
  '{0}: skipped — {1}': '{0}: пропущено — {1}',
  'close Steam first': 'сначала закройте Steam',
  'Dota was not found': 'Dota не найдена',
  'Steam was not found': 'Steam не найден',
  'Steam has no Dota entry for this account yet':
    'у Steam ещё нет записи о Dota для этого аккаунта',
};
