# Deep Forest Python

Интерактивный курс Python внутри Deep Forest Academy. Сейчас опубликованы три раздела: «Старт и основы Python», «Условия и циклы», «Строки и коллекции» — 32 урока. Полная программа — 21 раздел; единственная карта лежит в `content/course.yaml` и описана в `COURSE_DESIGN.md`. `frontend/src/content/manifest.json` собирается из этих файлов и вручную не правится.

## Запуск

```powershell
pip install -r backend/requirements.txt
python scripts/build_course_manifest.py
python scripts/validate_content.py
cd backend
python -m flask --app app run --port 5000
```

В другом окне:

```powershell
cd frontend
npm install
npm run dev
```

Сайт: http://127.0.0.1:5174/programs/python

`validate_content.py` сверяет `manifest.json` с YAML и не проходит, если манифест устарел. После правки уроков его нужно пересобрать и только потом проверять.

На сайте академии курс открывается карточкой Python и живёт по адресу `/python/`. Математика остаётся в соседней папке и своём репозитории.

Код ученика выполняется в браузере через Pyodide. Сервер хранит учётную запись, черновики, попытки и оценки. В локальном режиме код сброса пароля показывается на странице профиля.
