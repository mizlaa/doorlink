# Doorlink interactive demo (demo only)

A standalone, fictional click-through of the Doorlink app, built from the screen pack
on this branch. Sample data only. No payments, orders, emails or supplier connections.
It does not touch the Next.js app or any production settings.

## Demo accounts (password for all: `Demo123!`)

| Role | Email |
| --- | --- |
| Customer | customer@demo.doorlink.test |
| Installer | installer@demo.doorlink.test |
| Supplier | supplier@demo.doorlink.test |
| Manufacturer | manufacturer@demo.doorlink.test |
| Admin | admin@demo.doorlink.test |

## Preview on iPhone

Option 1, from a computer on the same Wi-Fi:

```bash
cd demo-app
python3 -m http.server 8080
```

Find the computer's local address (for example `192.168.1.20`), then on the iPhone open
Safari at `http://192.168.1.20:8080`. Use "Add to Home Screen" to open it full screen.

Option 2: open the published preview link on the iPhone.

## Tests

The smoke test uses the Playwright Chromium in the sandbox. Serve the folder on port 8092 and run:

```bash
node demo-app/tests/smoke.test.js
```

## Reset

Account > Reset demo clears everything saved in the browser.
