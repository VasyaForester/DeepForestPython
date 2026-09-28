# Deep Forest Python

Интерактивный курс Python внутри Deep Forest Academy. Сейчас опубликован раздел «Старт и основы Python»: три урока. Полная программа описана в `COURSE_DESIGN.md`.

## Запуск

```powershell
pip install -r backend/requirements.txt
python scripts/validate_content.py
python scripts/build_course_manifest.py
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

На сайте академии курс открывается карточкой Python и живёт по адресу `/python/`. Математика остаётся в соседней папке и своём репозитории.

Код ученика выполняется в браузере через Pyodide. Сервер хранит учётную запись, черновики, попытки и оценки. В локальном режиме код сброса пароля показывается на странице профиля.
