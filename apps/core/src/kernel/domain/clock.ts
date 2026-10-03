export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private currentTime: Date;

  constructor(start?: Date) {
    this.currentTime = start ? new Date(start.getTime()) : new Date('2026-01-01T00:00:00.000Z');
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  set(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  advance(ms: number): void {
    this.currentTime.setTime(this.currentTime.getTime() + ms);
  }
}
