import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";

const TMP = path.join(os.tmpdir(), `harbor-res-${process.pid}.db`);
process.env.HARBOR_DB_PATH = TMP;

type ResModule = typeof import("./reservations");
let res: ResModule;
let db: Database.Database;

function make(
  id: string,
  date: string,
  status: "confirmed" | "seated" | "completed" | "cancelled" = "confirmed",
  time = "18:00",
): void {
  db.prepare(
    `INSERT INTO reservations
       (id, name, phone, party_size, reserved_date, reserved_time, status)
     VALUES (?, 'Guest', '555-0200', 2, ?, ?, ?)`,
  ).run(id, date, time, status);
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    fs.rmSync(`${TMP}${suffix}`, { force: true });
  }
  res = await import("./reservations");
  db = (await import("./db")).getDb();
});

beforeEach(() => {
  db.prepare("DELETE FROM reservations").run();
});

describe("canTransitionReservation", () => {
  it("allows the host-stand flow and forbids skips", () => {
    expect(res.canTransitionReservation("confirmed", "seated")).toBe(true);
    expect(res.canTransitionReservation("confirmed", "cancelled")).toBe(true);
    expect(res.canTransitionReservation("seated", "completed")).toBe(true);
    expect(res.canTransitionReservation("confirmed", "completed")).toBe(false);
    expect(res.canTransitionReservation("completed", "seated")).toBe(false);
    expect(res.canTransitionReservation("cancelled", "confirmed")).toBe(false);
  });
});

describe("setReservationStatus", () => {
  it("seats then completes a confirmed booking", () => {
    make("HR-AAAAA", "2026-07-01");
    expect(res.setReservationStatus("HR-AAAAA", "seated").status).toBe("seated");
    expect(res.setReservationStatus("HR-AAAAA", "completed").status).toBe(
      "completed",
    );
  });

  it("rejects an illegal jump", () => {
    make("HR-BBBBB", "2026-07-01");
    expect(() => res.setReservationStatus("HR-BBBBB", "completed")).toThrow(
      res.ReservationTransitionError,
    );
  });

  it("rejects an unknown id", () => {
    expect(() => res.setReservationStatus("HR-NOPE0", "seated")).toThrow(
      res.ReservationTransitionError,
    );
  });

  it("is a no-op when the status is unchanged", () => {
    make("HR-CCCCC", "2026-07-01", "seated");
    expect(res.setReservationStatus("HR-CCCCC", "seated").status).toBe("seated");
  });
});

describe("getReservationsForDate", () => {
  it("returns only that date, in service order", () => {
    make("HR-LATE0", "2026-07-01", "confirmed", "20:00");
    make("HR-EARLY", "2026-07-01", "confirmed", "17:00");
    make("HR-OTHER", "2026-07-02", "confirmed", "18:00");
    const todays = res.getReservationsForDate("2026-07-01");
    expect(todays.map((r) => r.id)).toEqual(["HR-EARLY", "HR-LATE0"]);
  });
});
