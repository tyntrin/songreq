"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { setAcceptingAction } from "./actions";
import { Switch } from "./Switch";

export function AcceptSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 border-b border-line py-2">
      <div className="flex-1">
        <div className="text-base font-semibold">รับขอเพลง</div>
        <div className="text-[13px] text-muted">{on ? "ลูกค้าสแกน QR แล้วขอเพลงได้" : "หยุดรับชั่วคราว ลูกค้าจะเห็นว่าปิดรับอยู่"}</div>
      </div>
      <Switch
        label="รับขอเพลง"
        checked={on}
        disabled={pending}
        onChange={(next) => {
          setOn(next);
          start(async () => {
            try {
              await setAcceptingAction(next);
            } catch {
              setOn(!next);
            }
          });
        }}
      />
    </div>
  );
}

const SOUND_EVENT = "sr-sound-change";
function readSound(): boolean {
  try {
    return localStorage.getItem("sr_sound") !== "off";
  } catch {
    return true;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(SOUND_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SOUND_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function SoundSwitch() {
  const on = useSyncExternalStore(subscribe, readSound, () => true);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1">
        <div className="text-base font-semibold">เสียงแจ้งเตือนคำขอใหม่</div>
        <div className="text-[13px] text-muted">ดังตอนเปิดจอคำขอไว้</div>
      </div>
      <Switch
        label="เสียงแจ้งเตือนคำขอใหม่"
        checked={on}
        onChange={(next) => {
          try {
            localStorage.setItem("sr_sound", next ? "on" : "off");
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new Event(SOUND_EVENT));
        }}
      />
    </div>
  );
}
