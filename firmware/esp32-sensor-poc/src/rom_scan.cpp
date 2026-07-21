// เครื่องมือหน้างาน: อ่าน ROM id ของ DS18B20 ทั้ง 7 ตัวบนบัสเดียว (GPIO15) แล้วผูกเข้าตำแหน่ง
// (row1_head_top ฯลฯ ตาม config.h::DS_POSITION) เก็บถาวรใน NVS ให้ main.cpp (env esp32dev) ใช้ต่อ
//
// วิธีใช้หน้างาน (ดู README.md):
//   1) pio run -e romscan -t upload ; pio device monitor
//   2) พิมพ์ "scan" ซ้ำๆ ดูว่ามีกี่ตัวบนบัส (ต้องได้ 7) และ ROM แต่ละตัว
//   3) เอามือจับ/อุ่นโพรบที่รู้ตำแหน่งจริง (เช่น row1_head_top) แล้ว "scan" อีกครั้ง สังเกตตัวไหน
//      อุณหภูมิขึ้น -> จำ index บนบัส (bus_idx) ของตัวนั้น
//      พิมพ์ "list" เพื่อดูชื่อตำแหน่งทั้ง 7 พร้อมเลข index (pos_idx) ตรงกับ DS_POSITION
//   4) พิมพ์ "map <pos_idx> <bus_idx>" เพื่อผูก เช่น "map 0 3" (position 0 = row1_head_top = ตัวที่ 3 บนบัส)
//   5) ทำซ้ำจน map ครบทั้ง 7 ตำแหน่ง แล้ว "list" ตรวจสอบว่าไม่มีตำแหน่งไหนว่าง
#include <Arduino.h>
#include <string.h>
#include <stdlib.h>
#include "config.h"
#include "rom_map.h"
#include "onewire_multi.h"

static void print_help() {
  Serial.println("คำสั่ง: scan | list | map <pos_idx 0-6> <bus_idx> | clear <pos_idx> | help");
}

static void print_positions() {
  Serial.println("ตำแหน่ง (pos_idx : name : kind : rom ที่ผูกไว้):");
  for (int i = 0; i < DS18B20_COUNT; i++) {
    char rom[20];
    rom_map_get(i, rom, sizeof(rom));
    Serial.printf("  %d : %-16s : %-12s : %s\n", i, DS_POSITION[i], DS_KIND[i], rom[0] ? rom : "(ยังไม่ผูก)");
  }
}

static void do_scan() {
  int n = onewire_multi_bus_count();
  Serial.printf("เจอ %d ตัวบนบัส (ต้องการ %d):\n", n, DS18B20_COUNT);
  for (int i = 0; i < n; i++) {
    char rom[20]; float t;
    if (onewire_multi_read_at(i, rom, sizeof(rom), t)) {
      int pos = rom_map_find(rom);
      Serial.printf("  bus_idx=%d rom=%s T=%.2fC%s\n", i, rom, t,
                    pos >= 0 ? (String(" -> ") + DS_POSITION[pos]).c_str() : " (ยังไม่ผูกตำแหน่ง)");
    } else {
      Serial.printf("  bus_idx=%d อ่านไม่ได้\n", i);
    }
  }
}

static void do_map(int pos_idx, int bus_idx) {
  if (pos_idx < 0 || pos_idx >= DS18B20_COUNT) { Serial.println("pos_idx ต้องอยู่ 0-6"); return; }
  char rom[20]; float t;
  if (!onewire_multi_read_at(bus_idx, rom, sizeof(rom), t)) { Serial.println("อ่าน bus_idx นี้ไม่ได้ ลอง scan ก่อน"); return; }
  rom_map_set(pos_idx, rom);
  Serial.printf("ผูกแล้ว: %s (%s) -> rom %s\n", DS_POSITION[pos_idx], DS_KIND[pos_idx], rom);
}

static void handle_line(char *line) {
  char *cmd = strtok(line, " \t\r\n");
  if (!cmd) return;
  if (!strcmp(cmd, "scan")) {
    do_scan();
  } else if (!strcmp(cmd, "list")) {
    print_positions();
  } else if (!strcmp(cmd, "map")) {
    char *a = strtok(nullptr, " \t\r\n");
    char *b = strtok(nullptr, " \t\r\n");
    if (!a || !b) { Serial.println("ใช้: map <pos_idx> <bus_idx>"); return; }
    do_map(atoi(a), atoi(b));
  } else if (!strcmp(cmd, "clear")) {
    char *a = strtok(nullptr, " \t\r\n");
    if (!a) { Serial.println("ใช้: clear <pos_idx>"); return; }
    rom_map_set(atoi(a), "");
    Serial.println("ล้างแล้ว");
  } else {
    print_help();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[boot] rom_scan tool " FW_VERSION);
  rom_map_begin();
  onewire_multi_begin();
  print_help();
  print_positions();
}

void loop() {
  static char buf[64];
  static size_t len = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || len >= sizeof(buf) - 1) {
      buf[len] = 0;
      handle_line(buf);
      len = 0;
    } else if (c != '\r') {
      buf[len++] = c;
    }
  }
}
