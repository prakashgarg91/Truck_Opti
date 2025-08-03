# Copilot Instructions for TruckOpti

## Project Overview
TruckOpti is a Flask-based web application for optimizing truck loading using a 3D packing algorithm. It features RESTful APIs, interactive 3D visualization (Three.js), and analytics dashboards. The backend is Python/Flask with SQLite, and the frontend uses HTML/CSS/JS.

## Architecture & Key Files
- `run.py`: Main entry point; starts the Flask server.
- `app/`
  - `__init__.py`: App and extension initialization (Flask, SQLAlchemy).
  - `models.py`: SQLAlchemy models for trucks, cartons, jobs.
  - `routes.py`: RESTful API endpoints and view logic.
  - `packer.py`: 3D packing logic using `py3dbp`.
  - `static/`: Frontend assets (CSS, JS, images).
  - `templates/`: Jinja2 HTML templates for all UI pages.
- `requirements.txt`: Python dependencies (Flask, py3dbp, etc).
- `package.json`: Node.js dependencies for frontend and testing (Puppeteer, Jest).

## Developer Workflows
- **Setup:**
  - `pip install -r requirements.txt` (Python)
  - `npm install` (Node.js)
- **Run App:**
  - `python run.py` (Flask dev server at `http://127.0.0.1:5000`)
- **Testing:**
  - Start Flask server: `python run.py`
  - In another terminal: `npm test` (runs Puppeteer/Jest tests)
- **Database:**
  - SQLite DB auto-creates on app start; schema in `models.py`.

## Patterns & Conventions
- **API Design:** All API endpoints are defined in `routes.py` and follow RESTful conventions.
- **Packing Logic:** All carton/truck packing handled in `packer.py` via `py3dbp`.
- **Frontend:** Uses Jinja2 templates; 3D visualization in `static/main.js` (Three.js).
- **Testing:** End-to-end tests in `e2e-tests.js`, `e2e-test-2.js`, and `puppeteer-test.js`.
- **No migrations:** DB schema changes require manual updates to `models.py` and DB reset.

## Integration Points
- **External:**
  - `py3dbp` (Python 3D bin packing)
  - Puppeteer/Jest (Node.js testing)
- **Internal:**
  - Flask app context shared via `app/__init__.py`
  - Data flows: User input → API (`routes.py`) → Packing (`packer.py`) → DB (`models.py`) → UI (`templates/`)

## Example: Adding a New Carton Type
1. Update `models.py` with new carton fields.
2. Add form/UI in `templates/add_carton_type.html`.
3. Add API logic in `routes.py`.
4. Update packing logic in `packer.py` if needed.

## Tips for AI Agents
- Always check `run.py` and `app/__init__.py` for app context and extension setup.
- For new features, follow the RESTful API pattern in `routes.py` and update corresponding templates.
- For DB changes, update `models.py` and reset the SQLite DB if needed.
- Use `py3dbp` for all packing logic; do not reimplement algorithms.
- Place new tests in the existing JS test files and run with `npm test`.

---
_If any section is unclear or missing, please provide feedback for further refinement._
