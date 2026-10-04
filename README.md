# GoLocal

A platform for discovering Cambodian local products and connecting buyers, producers and businesses.
Built with HTML, CSS and JavaScript, using Supabase for the database, login and file storage.

## Running the site

1. Install the Live Server extension in VS Code.
2. Right-click `index.html` and choose Open with Live Server.

## Folders

| Path | Purpose |
|---|---|
| `index.html` | Home page |
| `css/style.css` | Shared colours, fonts, header, footer, buttons and cards |
| `css/home.css` | Home page layout |
| `js/supabase-client.js` | Connection to Supabase and small helpers |
| `js/i18n.js` | English and Khmer text |
| `js/layout.js` | Shared header and footer |
| `js/components.js` | Product card, request card and icons |
| `js/home.js` | Loads and displays the home page data |
| `js/sample-data.js` | Sample listings shown while the database is empty |
| `assets/images` | Images |
| `supabase` | Database setup script |

## Images to add

| File | Used for |
|---|---|
| `assets/images/banners/banner-1.jpg` to `banner-4.jpg` | Story cards at the top |
| `assets/images/hero-bg.jpg` | Background behind the stories and categories |
| `assets/images/farm-bg.jpg` | Background of the producer spotlight |
| `assets/images/categories/<slug>.png` | Category icons, for example `snacks.png` |
| `assets/images/sample/*.jpg` | Sample product photos, names listed in `js/sample-data.js` |

## Security note

Only the publishable key is used in the website. The secret key must never be added to any file.
