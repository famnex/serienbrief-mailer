# Serienbrief-Mailer (Emailer)

Ein benutzerfreundliches und elegantes Web-Tool zum Verfassen und Versenden von Serienbrief-E-Mails auf Basis einer CSV-Datei.

## Features

- **SMTP-Einstellungen**: Einfache Hinterlegung Ihrer E-Mail-Server-Daten (Host, Port, Verschlüsselung, Login). Inklusive Verbindungstest.
- **CSV-Import**: Hochladen von CSV-Dateien (Semikolon-separiert, UTF-8). Eine Vorschau der ersten 10 Zeilen wird direkt angezeigt.
- **WYSIWYG-Editor**: Komfortables Schreiben und Formatieren von E-Mails über den integrierten Quill-Editor.
- **Dynamische Platzhalter**: Platzhalter auf Basis der CSV-Spalten (z. B. `{{Vorname}}`, `{{Nachname}}`) können per Klick in den Betreff oder Mail-Inhalt eingefügt werden.
- **Empfänger-Zuordnung**: Auswahl der Spalte für die E-Mail-Adresse direkt über ein Dropdown-Menü.
- **Einzeltest-Versand**: Senden einer personalisierten E-Mail an eine ausgewählte Zeile (entweder an die echte E-Mail oder optional an eine alternative Test-Adresse).
- **Massenversand (Batch)**: Live-Versand aller Kontakte mit Echtzeit-Fortschrittsbalken und Log-Ausgabe.
- **Dashboard & Logs**: Statistiken über erfolgreiche und fehlgeschlagene E-Mails sowie eine Historie aller Aktivitäten.

## Installation & Start

1. Öffnen Sie die Konsole im Projektordner.
2. Installieren Sie die Abhängigkeiten (falls noch nicht geschehen):
   ```bash
   npm install
   ```
3. Starten Sie den Server:
   ```bash
   npm start
   ```
4. Öffnen Sie Ihren Webbrowser unter: [http://localhost:3000](http://localhost:3000)

## Datenbankstruktur (`db.md`)

Die Daten (SMTP-Einstellungen, Entwürfe und Logs) werden in einer lokalen SQLite-Datenbank (`emailer.db`) gespeichert. Details zur Tabellenstruktur finden Sie in der [db.md](db.md).
