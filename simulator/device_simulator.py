import time
import json
import random
import threading
import sys
import paho.mqtt.client as mqtt

THINGSBOARD_HOST = "161.53.133.253"
THINGSBOARD_PORT = 8080

DEVICES_CONFIG = {
    
    "PIR-lav": {
        "token": "Xml4RkrRi1pNbNovHrKE",  
        "profile": "SmartZoo-PIR",
        "enclosure": "lav"
    },
    "VirtualScale-lav": {
        "token": "umTj9est5FHmwcS1dkXX",      
        "profile": "SmartZoo-VirtualSensor",
        "enclosure": "lav"
    },
    "ESP32-lav": {
        "token": "ZBnI3JYKXcBSs0UnBpoy",      
        "profile": "SmartZoo-ESP32",
        "enclosure": "lav"
    },
    
    "PIR-slon": {
        "token": "f3QW5CzWxhLja9Da5vmq",  
        "profile": "SmartZoo-PIR",
        "enclosure": "slon"
    },
    "VirtualScale-slon": {
        "token": "fmUqtxXZ1ByYj4evXQ21",     
        "profile": "SmartZoo-VirtualSensor",
        "enclosure": "slon"
    },
    "ESP32-slon": {
        "token": "iWkW4ysZembAqppDhQbk",     
        "profile": "SmartZoo-ESP32",
        "enclosure": "slon"
    },
    
    "PIR-zebra": {
        "token": "azxlgoewocd6jyawtc4l",      
        "profile": "SmartZoo-PIR",
        "enclosure": "zebra"
    },
    "VirtualScale-zebra": {
        "token": "cTA4XqHGgJbskHUju5TS",    
        "profile": "SmartZoo-VirtualSensor",
        "enclosure": "zebra"
    },
    "ESP32-zebra": {
        "token": "0hpeYFQuEz4f3NAIWCqF",    
        "profile": "SmartZoo-ESP32",
        "enclosure": "zebra"
    }
}

enclosures_state = {
    "lav": {
        "temperature": 24.5,
        "humidity": 52.0,
        "motion_detected": False,
        "weight": 190.2,       
        "food_level": 15.0,     
        "gate_locked": True,
    },
    "slon": {
        "temperature": 22.1,
        "humidity": 58.0,
        "motion_detected": False,
        "weight": 4250.0,      
        "food_level": 45.0,     
        "gate_locked": True,
    },
    "zebra": {
        "temperature": 20.4,
        "humidity": 60.0,
        "motion_detected": False,
        "weight": 340.5,       
        "food_level": 22.0,     
        "gate_locked": True,
    }
}

state_lock = threading.Lock()

def on_connect(client, userdata, flags, rc):
    dev_name = userdata.get("name")
    profile = userdata.get("profile")
    if rc == 0:
        print(f"[POVEZANO] Uredjaj '{dev_name}' ({profile}) spojen na ThingsBoard.")
        if profile == "SmartZoo-ESP32":
            client.subscribe("v1/devices/me/rpc/request/+")
            print(f"[RPC] '{dev_name}' pretplacen na RPC naredbe.")
    else:
        print(f"[GRESKA] '{dev_name}' se nije mogao spojiti. Kod greske: {rc}")

def on_message(client, userdata, msg):
    dev_name = userdata.get("name")
    enclosure_id = userdata.get("enclosure")
    topic = msg.topic
    payload = msg.payload.decode("utf-8")
    
    print(f"[RPC PORUKA] Uredjaj '{dev_name}' primio RPC na temi: {topic}")
    print(f"             Sadrzaj: {payload}")
    
    parts = topic.split('/')
    request_id = parts[-1] if len(parts) > 0 else "0"
    
    try:
        data = json.loads(payload)
        method = data.get("method")
        params = data.get("params")
        
        response = {"success": True}
        
        with state_lock:
            state = enclosures_state[enclosure_id]
            if method == "setGateLock":
                target_state = params if isinstance(params, bool) else params.get("targetState", True)
                state["gate_locked"] = target_state
                print(f"[AKTUATOR - {enclosure_id.upper()}] Sigurnosna vrata: {'ZAKLJUČANA' if target_state else 'OTKLJUČANA'}")
                response["gate_locked"] = target_state
                
            elif method == "triggerFeeder":
                added_food = random.uniform(10.0, 20.0)
                state["food_level"] = min(100.0, state["food_level"] + added_food)
                print(f"[AKTUATOR - {enclosure_id.upper()}] Hranilica aktivirana! Dodano {added_food:.2f} kg hrane. Novo stanje: {state['food_level']:.2f} kg.")
                response["food_level"] = state["food_level"]
                
            else:
                print(f"[RPC GRESKA] Nepoznata RPC metoda za {dev_name}: {method}")
                response = {"error": "nepoznata RPC metoda"}
        
        response_topic = f"v1/devices/me/rpc/response/{request_id}"
        client.publish(response_topic, json.dumps(response), qos=1)
        print(f"[RPC ODGOVOR] '{dev_name}' poslao odgovor na {response_topic}: {response}")
        
    except Exception as e:
        print(f"[GRESKA] Problem pri obradi RPC na '{dev_name}': {e}")

def telemetry_sender(client, dev_name, config):
    enclosure_id = config["enclosure"]
    profile = config["profile"]
    
    while True:
        telemetry = {}
        with state_lock:
            state = enclosures_state[enclosure_id]
            
            state["temperature"] += random.uniform(-0.15, 0.15)
            state["temperature"] = max(15.0, min(35.0, state["temperature"]))
            
            state["humidity"] += random.uniform(-0.5, 0.5)
            state["humidity"] = max(30.0, min(95.0, state["humidity"]))
            
            state["food_level"] -= random.uniform(0.01, 0.05)
            if state["food_level"] < 2.0:
                state["food_level"] = 50.0
                print(f"[INFO] Hranilica za '{enclosure_id}' automatski dopunjena.")
            
            state["weight"] += random.uniform(-0.5, 0.5)
            state["weight"] = round(max(5.0, state["weight"]), 2)
            
            state["motion_detected"] = random.random() < 0.2
            
            if profile == "SmartZoo-PIR":
                telemetry = {
                    "motion_detected": state["motion_detected"]
                }
            elif profile == "SmartZoo-VirtualSensor":
                telemetry = {
                    "weight": round(state["weight"], 2)
                }
            elif profile == "SmartZoo-ESP32":
                telemetry = {
                    "temperature": round(state["temperature"], 1),
                    "humidity": round(state["humidity"], 1),
                    "food_level": round(state["food_level"], 2),
                    "gate_locked": state["gate_locked"]
                }
        
        try:
            client.publish("v1/devices/me/telemetry", json.dumps(telemetry), qos=1)
            if random.random() < 0.3:
                print(f"[TELEMETRIJA - {dev_name}] Poslano: {telemetry}")
        except Exception as e:
            print(f"[TELEMETRIJA GRESKA - {dev_name}] Slanje neuspjesno: {e}")
            
        time.sleep(5)

def main():
    print("=" * 65)
    print(" SmartZOO IoT Simulator - Model s 9 Uredjaja (Zebra ukljucuje PIR)")
    print(f" Povezivanje na: {THINGSBOARD_HOST}:{THINGSBOARD_PORT}")
    print("=" * 65)
    
    threads = []
    clients = []
    
    for dev_name, cfg in DEVICES_CONFIG.items():
        token = cfg["token"]
        profile = cfg["profile"]
        
        client = mqtt.Client(
            client_id=f"SmartZOO_{dev_name}_Sim", 
            userdata={"name": dev_name, "profile": profile, "enclosure": cfg["enclosure"]}
        )
        client.username_pw_set(username=token)
        client.on_connect = on_connect
        client.on_message = on_message
        
        try:
            client.connect(THINGSBOARD_HOST, THINGSBOARD_PORT, 60)
            client.loop_start()
            clients.append(client)
            
            t = threading.Thread(target=telemetry_sender, args=(client, dev_name, cfg), daemon=True)
            t.start()
            threads.append(t)
            
        except Exception as e:
            print(f"[NEUSPJEH] Uredjaj '{dev_name}' se nije mogao spojiti na ThingsBoard: {e}")
            
    if len(clients) == 0:
        print("\n[FATALNA GRESKA] Nijedan uredjaj se nije uspio povezati na ThingsBoard.")
        print("Provjerite jeste li spojeni na fakultetsku mrezu (ili odgovarajuci VPN/WiFi).")
        print("Simulator se gasi...")
        sys.exit(1)
        
    print(f"\nUspjesno pokrenuto {len(clients)}/9 simulatora uredjaja! Pritisnite Ctrl+C za prekid.\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nZaustavljanje simulatora...")
        for client in clients:
            client.loop_stop()
        print("Simulator zaustavljen.")

if __name__ == "__main__":
    main()
