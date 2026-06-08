# SmartZOO - IoT Control Panel & Simulator (9 Uređaja)

Ovaj projekt predstavlja cjelovito IoT rješenje za pametni zoološki vrt (**SmartZOO**), prilagođeno za rad s **9 ThingsBoard uređaja** podijeljenih u **3 nastambe**: **Lav**, **Slon** i **Zebra**.

---

## Struktura Projekta i Uređaji

Za svaku od nastambi simuliraju se tri zasebna ThingsBoard uređaja prema profilima:

1. **PIR senzor aktivnosti (`SmartZoo-PIR`)**
   - Telemetrija: `{"motion_detected": true/false}`
2. **Virtualni senzor težine (`SmartZoo-VirtualSensor`)**
   - Telemetrija: `{"weight": float}` (težina životinje u kg)
3. **Hranilica/Vrata (`SmartZoo-ESP32`)**
   - Telemetrija: `{"temperature": float, "humidity": float, "food_level": float, "gate_locked": bool}`
   - Primanje RPC naredbi:
     - `setGateLock` (param: `true/false`) -> Otključavanje/Zaključavanje vrata nastambe.
     - `triggerFeeder` -> Aktivacija hranilice (+15kg hrane).

---

## Konfiguracija Tokena

U simulatoru (`simulator/device_simulator.py`) konfigurirani su sljedeći tokeni:

| Nastamba | Uređaj | Stvarni Token / Placeholder |
| :--- | :--- | :--- |
| **Lav** | `PIR-lav` | `Xml4RkrRi1pNbNovHrKE` (Stvarni token) |
| **Lav** | `VirtualScale-lav` | `LAV_SCALE_TOKEN` (Placeholder) |
| **Lav** | `ESP32-lav` | `LAV_ESP32_TOKEN` (Placeholder) |
| **Slon** | `PIR-slon` | `f3QW5CzWxhLja9Da5vmq` (Stvarni token) |
| **Slon** | `VirtualScale-slon` | `SLON_SCALE_TOKEN` (Placeholder) |
| **Slon** | `ESP32-slon` | `SLON_ESP32_TOKEN` (Placeholder) |
| **Zebra** | `PIR-zebra` | `ZEBRA_PIR_TOKEN` (Placeholder) |
| **Zebra** | `VirtualScale-zebra` | `ZEBRA_SCALE_TOKEN` (Placeholder) |
| **Zebra** | `ESP32-zebra` | `ZEBRA_ESP32_TOKEN` (Placeholder) |

*Napomena: Placeholder tokene možete zamijeniti stvarnim tokenima iz ThingsBoard sučelja unutar konfiguracijskog dijela na vrhu datoteke `simulator/device_simulator.py`.*

---

## Pokretanje Projekta

### 1. Pokretanje Simulatora (9 MQTT klijenata)
Simulator pokreće 9 paralelnih dretvi i MQTT klijenata koji šalju podatke na:
- **Broker Host:** `161.53.133.253`
- **Broker Port:** `45883`

```bash
cd simulator
pip install -r requirements.txt
python device_simulator.py
```

*Ako niste spojeni na fakultetsku mrežu (ili VPN), simulator će ispisati grešku `timeout` i ugasiti se. Za lokalnu prezentaciju koristite Sandbox mod unutar Web aplikacije.*

---

### 2. Pokretanje Web Aplikacije (React + Vite)
Web sučelje objedinjuje podatke svih 9 senzora po nastambama.

```bash
cd frontend
npm run dev
```

Otvorite **[http://localhost:5173/](http://localhost:5173/)** u pregledniku.

- **Sandbox mod**: Pomoću klizača (temperatura, vlažnost, težina, hrana) u desnom stupcu možete mijenjati stanja i pratiti kako se sučelje ponaša lokalno.
- **ThingsBoard Live**: Povežite se s REST API-jem (`161.53.133.253:8080`) koristeći svoje ThingsBoard login podatke i unesite Device ID-ove za svih 9 uređaja.
