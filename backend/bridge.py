import asyncio
import zmq
import zmq.asyncio
import struct
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from typing import List, Dict, Any
import os
from pydantic import BaseModel

class CommandRequest(BaseModel):
    topic: str
    value: float

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch ZMQ subscribers
    tasks = []
    for name, url in ENDPOINTS.items():
        task = asyncio.create_task(zmq_subscriber(name, url))
        tasks.append(task)
    
    # Initialize Command REQ socket
    app.state.zmq_ctx = zmq.asyncio.Context()
    app.state.cmd_sock = app.state.zmq_ctx.socket(zmq.REQ)
    app.state.cmd_sock.setsockopt(zmq.LINGER, 0)  # Don't block on close
    app.state.cmd_sock.connect(CMD_URL)
    print(f"[ZMQ Bridge] Command REQ connected to {CMD_URL}")
    
    yield
    
    # Shutdown: Clean up tasks
    for task in tasks:
        task.cancel()
    
    app.state.cmd_sock.close()
    app.state.zmq_ctx.term()

app = FastAPI(lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Payload Schemas ────────────────────────────────────────────────────────
# MsgHeader (10 bytes): sid(B), seq(B), ts_ms(Q)
# Analog (14): Header + float(f)
# Digital (11): Header + uint8(B)
# Encoder (14): Header + int32(i)

# Metadata discovery from TOPIC_REGISTRY
TOPICS = {
    "/sensors/food_weight/bowl_1": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/food_weight/bowl_2": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/water_level/tank": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/water_level/bowl": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/environment/humidity": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/environment/temperature": {"cat": "ANALOG", "ep": "sensors"},
    "/sensors/camera_rotation/limit_switch_1": {"cat": "DIGITAL", "ep": "sensors"},
    "/sensors/camera_rotation/limit_switch_2": {"cat": "DIGITAL", "ep": "sensors"},
    "/sensors/camera_rotation/optical_encoder": {"cat": "ENCODER", "ep": "sensors"},
    "/sensors/camera_rotation/home": {"cat": "DIGITAL", "ep": "sensors"},
    "/system/power/switch": {"cat": "DIGITAL", "ep": "system"},
    "/system/power/battery_level": {"cat": "ANALOG", "ep": "system"},
    "/system/time/clock": {"cat": "ANALOG", "ep": "system"},
    "/system/device/heartbeat": {"cat": "DIGITAL", "ep": "system"},
    "/system/connectivity/state": {"cat": "DIGITAL", "ep": "system"},
    "/status/lid/1": {"cat": "ANALOG", "ep": "status"},
    "/status/lid/2": {"cat": "ANALOG", "ep": "status"},
    "/status/water_pump": {"cat": "DIGITAL", "ep": "status"},
    "/status/camera_rotation/stepper_motor": {"cat": "DIGITAL", "ep": "status"},
    "/status/camera_rotation/servo_motor": {"cat": "DIGITAL", "ep": "status"},
    "/status/display/seven_segment": {"cat": "ANALOG", "ep": "status"},
    "/status/led_indicator": {"cat": "ANALOG", "ep": "status"},
    "/commands/camera_rotation": {"cat": "COMMAND", "ep": "commands"},
    "/commands/camera_rotation_servo": {"cat": "COMMAND", "ep": "commands"},
    "/commands/feed": {"cat": "COMMAND", "ep": "commands"},
    "/commands/treat/dispense": {"cat": "COMMAND", "ep": "commands"},
    "/commands/photo_capture": {"cat": "COMMAND", "ep": "commands"},
    "/commands/live_session/start": {"cat": "COMMAND", "ep": "commands"},
    "/commands/live_session/end": {"cat": "COMMAND", "ep": "commands"},
    "/commands/camera/ir_control": {"cat": "COMMAND", "ep": "commands"},
    "/commands/audio/speakers": {"cat": "COMMAND", "ep": "commands"},
    "/commands/settings/apply": {"cat": "COMMAND", "ep": "commands"},
    "/commands/firmware/update": {"cat": "COMMAND", "ep": "commands"},
    "/commands/led": {"cat": "COMMAND", "ep": "commands"},
    "/status/lid_motor/1": {"cat": "DIGITAL", "ep": "status"},
    "/status/lid_motor/2": {"cat": "DIGITAL", "ep": "status"},
    "/sensors/treat/level_indicator_ir": {"cat": "DIGITAL", "ep": "sensors"},
    "/sensors/treat/sorter_ir": {"cat": "DIGITAL", "ep": "sensors"},
    "/sensors/treat/thrower_ir": {"cat": "DIGITAL", "ep": "sensors"},
    "/sensors/thermal/ir_array": {"cat": "THERMAL", "ep": "sensors"},
}

ENDPOINTS = {
    "sensors": "ipc:///tmp/oro_sensors.ipc",
    "system": "ipc:///tmp/oro_system.ipc",
    "status": "ipc:///tmp/oro_status.ipc"
}

CMD_URL = "tcp://localhost:5555"  # CloudReceiver binds on tcp://*:5555

# ── Global State ────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# ── ZMQ Processing ──────────────────────────────────────────────────────────

async def zmq_subscriber(endpoint_name: str, url: str):
    ctx = zmq.asyncio.Context()
    sock = ctx.socket(zmq.SUB)
    sock.connect(url)
    sock.setsockopt_string(zmq.SUBSCRIBE, "") # Subscribe to all
    
    print(f"[ZMQ Bridge] Connected to {endpoint_name} at {url}")
    
    while True:
        try:
            parts = await sock.recv_multipart()
            if len(parts) >= 2:
                topic = parts[0].decode('utf-8', errors='ignore')
                payload = parts[1]
                
                # Minimum header size is 10 bytes
                if len(payload) < 10:
                    continue
                
                sid, seq, ts_ms = struct.unpack('<BBQ', payload[:10])
                
                # Metadata discovery from TOPIC_REGISTRY
                meta = TOPICS.get(topic, {})
                cat = meta.get("cat")

                data = {
                    "topic": topic,
                    "endpoint": meta.get("ep", endpoint_name),
                    "sid": sid,
                    "seq": seq,
                    "ts": ts_ms,
                    "value": None,
                    "type": "UNKNOWN"
                }

                if len(payload) == 14:
                    if cat == "ENCODER" or "encoder" in topic:
                        data["value"], = struct.unpack('<i', payload[10:14])
                        data["type"] = "ENCODER"
                    else:
                        data["value"], = struct.unpack('<f', payload[10:14])
                        data["type"] = "ANALOG"
                        # Handle specific labels for analog display topics
                        if "/status/display/seven_segment" in topic:
                            data["label"] = str(int(data["value"]))
                        elif "lid" in topic and "motor" not in topic:
                            v = data["value"]
                            if v >= 2.5: # 3.0 = transition
                                data["label"] = "TRANSITION"
                            else:
                                data["label"] = "OPEN" if v >= 0.5 else "CLOSED"
                            
                elif len(payload) == 11:
                    data["value"], = struct.unpack('<B', payload[10:11])
                    data["type"] = "DIGITAL"
                    
                    # Generate human labels
                    val = data["value"]
                    if "lid" in topic and "motor" not in topic:
                        if val >= 3:
                            data["label"] = "TRANSITION"
                        else:
                            data["label"] = "OPEN" if val else "CLOSED"
                    elif "water_level/bowl" in topic:
                        data["label"] = "NOT FULL" if val else "FULL"
                    elif "water_pump" in topic:
                        data["label"] = "PUMPING" if val else "IDLE"
                    elif "motor" in topic:
                        data["label"] = "RUNNING" if val else "IDLE"
                    elif "/system/connectivity/state" in topic:
                        if val == 2:
                            data["label"] = "INTERNET"
                        elif val == 1:
                            data["label"] = "LOCAL ONLY"
                        else:
                            data["label"] = "DISCONNECTED"
                    elif "/sensors/camera_rotation/home" in topic:
                        data["label"] = "AT HOME" if val else "NOT AT HOME"
                    elif "/status/camera_rotation/servo_motor" in topic:
                        data["label"] = "ENGAGED" if val == 0 else "DISENGAGED"
                    else:
                        data["label"] = "ACTIVE" if val else "INACTIVE"
                
                elif len(payload) == 286:
                    # ThermalPayload: Header(10) + amg_frame_t(276)
                    # amg_frame_t: ts(I), amb(f), pixels(64f), min(f), max(f), ovf(B), pad(3x)
                    frame_data = payload[10:]
                    unpacked = struct.unpack('<If64fffB3x', frame_data)
                    data["type"] = "THERMAL"
                    data["ambient"] = unpacked[1]
                    data["pixels"] = list(unpacked[2:66])
                    data["min"] = unpacked[66]
                    data["max"] = unpacked[67]
                    # value for thermal is avg or max for simple scaling
                    data["value"] = data["max"] 

                await manager.broadcast(json.dumps(data))
                
        except Exception as e:
            print(f"[ZMQ Bridge] Error in {endpoint_name}: {e}")
            await asyncio.sleep(1)

# ── FastAPI Routes ──────────────────────────────────────────────────────────


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def reset_cmd_socket():
    """Recreate the REQ socket after an error to clear the EFSM stuck state."""
    try:
        app.state.cmd_sock.close()
    except Exception:
        pass
    app.state.cmd_sock = app.state.zmq_ctx.socket(zmq.REQ)
    app.state.cmd_sock.setsockopt(zmq.LINGER, 0)  # Don't block on close
    app.state.cmd_sock.connect(CMD_URL)
    print("[ZMQ Bridge] Command socket reset.")

@app.post("/api/command")
async def post_command(cmd: CommandRequest):
    try:
        import uuid, time
        if cmd.topic.startswith("/commands/lid/"):
            lid_id = 1 if "1" in cmd.topic else 2
            action = 1 if cmd.value >= 0.5 else 0
            payload = {
                "header": {
                    "signal_id": "64",
                    "signal_type": "lid_actuation_command",
                    "command_id": f"web_lid_{uuid.uuid4().hex[:8]}",
                    "issued_by": "web_dashboard",
                    "event_time": int(time.time() * 1000)
                },
                "payload": {
                    "lid_id": lid_id,
                    "action": action
                }
            }
            await app.state.cmd_sock.send_string(json.dumps(payload))
            reply = await asyncio.wait_for(
                app.state.cmd_sock.recv_string(), timeout=12.0
            )
            return json.loads(reply)

        if cmd.topic == "/commands/camera_rotation":
            payload = {
                "header": {
                    "signal_id": "134",
                    "signal_type": "camera_rotation_command",
                    "command_id": f"web_cam_{uuid.uuid4().hex[:8]}",
                    "issued_by": "web_dashboard",
                    "event_time": int(time.time() * 1000)
                },
                "payload": {
                    "angle": cmd.value,
                    "value": cmd.value
                }
            }
            await app.state.cmd_sock.send_string(json.dumps(payload))
            reply = await asyncio.wait_for(
                app.state.cmd_sock.recv_string(), timeout=15.0
            )
            return json.loads(reply)

        payload = {
            "topic": cmd.topic,
            "value": cmd.value
        }
        await app.state.cmd_sock.send_string(json.dumps(payload))

        # Use asyncio.wait_for instead of RCVTIMEO — RCVTIMEO fires at the ZMQ
        # level and leaks a CancelledError into the uvloop callback chain,
        # breaking the REQ socket FSM permanently.
        reply = await asyncio.wait_for(
            app.state.cmd_sock.recv_string(), timeout=15.0
        )
        return json.loads(reply)
    except (asyncio.TimeoutError, asyncio.CancelledError, Exception) as e:
        print(f"[ZMQ Bridge] Command error: {type(e).__name__}: {e}")
        # REQ socket FSM is stuck — close and recreate for next command.
        reset_cmd_socket()
        return {"status": "error", "message": f"Command Timeout or Failure: {str(e)}"}

class ExecuteRequest(BaseModel):
    header: Dict[str, Any]
    payload: Dict[str, Any]

@app.post("/api/execute")
async def execute_command(req: ExecuteRequest):
    try:
        payload = {
            "header": req.header,
            "payload": req.payload
        }
        await app.state.cmd_sock.send_string(json.dumps(payload))

        reply = await asyncio.wait_for(
            app.state.cmd_sock.recv_string(), timeout=12.0
        )
        return json.loads(reply)
    except (asyncio.TimeoutError, asyncio.CancelledError, Exception) as e:
        print(f"[ZMQ Bridge] Execute error: {type(e).__name__}: {e}")
        reset_cmd_socket()
        return {"status": "error", "message": f"Execute Timeout or Failure: {str(e)}"}

@app.get("/")
async def get_index():
    return FileResponse(
        os.path.join(os.path.dirname(__file__), "../static/index.html"),
        media_type="text/html"
    )

app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "../static"), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
