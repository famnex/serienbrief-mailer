# Datenbankdokumentation (db.md)

Diese Datei dokumentiert die Struktur der SQLite-Datenbank für das E-Mail-Tool.

## Datenbank-Tabellen

### 1. `settings`
Speichert die SMTP-Konfiguration für den E-Mail-Versand. Es gibt maximal einen Eintrag in dieser Tabelle.

| Spalte | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | Eindeutige ID (Standard: 1) |
| `host` | TEXT | SMTP-Server-Host (z.B. `smtp.example.com`) |
| `port` | INTEGER | SMTP-Server-Port (z.B. `587` oder `465`) |
| `secure` | INTEGER | SSL/TLS verwenden (0 = false, 1 = true) |
| `user` | TEXT | SMTP-Benutzername |
| `pass` | TEXT | SMTP-Passwort |
| `from_email` | TEXT | Absender-E-Mail-Adresse |
| `from_name` | TEXT | Absender-Name |

### 2. `templates`
Speichert den Entwurf der E-Mail (Betreff, Body und das ausgewählte Empfänger-Attribut).

| Spalte | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY | Eindeutige ID (Standard: 1) |
| `subject` | TEXT | Betreffzeile der E-Mail |
| `body` | TEXT | HTML-Inhalt des E-Mail-Bodys |
| `recipient_column` | TEXT | Name der CSV-Spalte, die die Empfänger-E-Mail enthält |

### 3. `logs`
Protokolliert den Verlauf aller versendeten E-Mails.

| Spalte | Datentyp | Beschreibung |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Eindeutige Log-ID |
| `timestamp` | TEXT | Zeitstempel des Versands (ISO 8601) |
| `recipient` | TEXT | E-Mail-Adresse des Empfängers |
| `subject` | TEXT | Verwendeter Betreff nach Platzhalter-Ersetzung |
| `status` | TEXT | Status des Versands (`SUCCESS` oder `FAILED`) |
| `error_message` | TEXT | Fehlermeldung bei Fehlversand (falls vorhanden) |

---

## Initialisierung und Schema-Updates

Die Tabellen werden beim Start der Anwendung (`db.js`) automatisch erzeugt, falls sie noch nicht existieren.
