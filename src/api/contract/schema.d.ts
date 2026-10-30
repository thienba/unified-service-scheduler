// Generated from openapi.yaml by scripts/generate-contract.mjs. Do not edit.
export interface paths {
  "/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * The current demo user
     * @description Gives the role, the customer id and the dealerships of the user named in `X-Demo-User`.
     */
    get: operations["getMe"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * All dealerships
     * @description Every role may list the dealerships. Each has its time zone and, when it has one, a phone number.
     */
    get: operations["listDealerships"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * One dealership with its hours and policies
     * @description Every role may read a dealership.
     */
    get: operations["getDealership"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}/settings": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Save hours, date overrides and policies
     * @description Manager of the dealership only. Appointments that no longer fit are flagged, never moved or
     *     deleted. With `preview=true` nothing is saved and the answer lists what would be flagged.
     */
    put: operations["updateDealershipSettings"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/service-types": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * All service types
     * @description Every role may list the service types with their duration and required skill.
     */
    get: operations["listServiceTypes"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}/technicians": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Technicians with their shifts and booked times
     * @description Staff and managers of the dealership. Each technician comes with skills, weekly pattern,
     *     date exceptions and the booked intervals between `from` and `to` (both included, at most 31 days).
     */
    get: operations["listTechnicians"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/technicians/{technicianId}/shifts": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Save a technician's weekly pattern and date exceptions
     * @description Manager of the technician's dealership only; a technician of another dealership is not found.
     *     Appointments that no longer fit are flagged. With `preview=true` nothing is saved.
     */
    put: operations["updateTechnicianShifts"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}/service-bays": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * The service bays of a dealership
     * @description Staff and managers of the dealership.
     */
    get: operations["listServiceBays"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}/schedule": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * One day of the staff schedule
     * @description Staff and managers of the dealership. The appointments of one local date, the active bays, and
     *     each active technician with their shift, break and leave that day and the free windows a booking
     *     could start in (30 minutes or longer, worked out by the domain, D-0001-21 A).
     */
    get: operations["getScheduleDay"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/dealerships/{dealershipId}/availability": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Free start times on one local date
     * @description Every role. `technicianId` is for staff and managers only; a customer who sends it is refused.
     *     Staff and managers ask about their own dealerships. `appointmentId` leaves that appointment out of
     *     the search, for the person moving it; only its owner, or staff or a manager of its dealership, may send
     *     it, and anyone else gets the same 404 as for a missing appointment.
     */
    get: operations["searchAvailability"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/availability-checks": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Check one start time
     * @description Says whether one start time is free. It never answers 409: a taken time is a normal answer
     *     (`available: false`, with reasons and suggested times). `technicianId` is for staff and managers only.
     *     `appointmentId` leaves that appointment out of the check, for the person moving it; only its owner, or
     *     staff or a manager of its dealership, may send it, and anyone else gets the same 404 as for a missing
     *     appointment.
     */
    post: operations["checkAvailability"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/appointments": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List appointments
     * @description Staff and managers: the appointments of one dealership on one local date (`dealershipId` and
     *     `date`), or with `flagged=true` every flagged appointment of the dealership from now on, soonest first.
     *     Customers: only their own. Without a date a customer gets their own appointments from now on,
     *     soonest first. Cancelled appointments are left out unless `includeCancelled=true`. With
     *     `includePast=true` a customer also gets their own appointments that have ended, after the others,
     *     newest first. `includePast` changes nothing for staff and managers.
     */
    get: operations["listAppointments"];
    put?: never;
    /**
     * Book an appointment
     * @description A customer books for themselves. Staff and managers book for a customer of their dealership
     *     (`customerId` with `vehicleId` or `newVehicle`, or `newCustomer` with `newVehicle`) and may fix a
     *     `technicianId`. Every missing field is named in the 422 answer. A taken time answers 409 with
     *     reasons and suggested times.
     */
    post: operations["bookAppointment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/appointments/{appointmentId}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * One appointment
     * @description The owner, and staff or a manager of its dealership. Anyone else gets "not found".
     */
    get: operations["getAppointment"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * The manager moves or reassigns an appointment
     * @description Manager of the appointment's dealership only. The change is checked like a booking. A technician
     *     or bay that is not named is kept when free, otherwise picked by the booking rule; `picked` says
     *     which were picked. A clash answers 409 with suggestions and changes nothing.
     */
    patch: operations["adjustAppointment"];
    trace?: never;
  };
  "/appointments/{appointmentId}/reschedule": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Move an appointment to a new start
     * @description The owner before the cutoff, and a manager of the dealership. The old time stays until the new one
     *     is written. A customer after the cutoff gets 409 `CHANGE_WINDOW_CLOSED`.
     */
    post: operations["rescheduleAppointment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/appointments/{appointmentId}/cancel": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cancel an appointment
     * @description The owner before the cutoff, and a manager of the dealership. A second cancel answers 200 with
     *     the same cancelled appointment.
     */
    post: operations["cancelAppointment"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/customers/search": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Find customers
     * @description Staff and managers. Send `text` (3 to 50 characters; part of a name, a phone or a registration),
     *     or `phone` and/or `registration` to look for the same number (digits only) or plate (letters and numbers) (the new-customer duplicate hint).
     *     The search text travels in the body, never in the URL. At most 10 customers come back.
     */
    post: operations["searchCustomers"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/customers/{customerId}/vehicles": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * A customer's vehicles
     * @description The customer themselves, and staff or a manager. Anyone else gets "not found".
     */
    get: operations["listCustomerVehicles"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/outbox": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * The messages the system would send
     * @description Managers only, for their own dealerships. Each message has its cancel and reschedule links, made
     *     from the origin of the request, a fixed path and the appointment id.
     */
    get: operations["listOutbox"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/_demo/telemetry": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Recent log lines and metric values
     * @description Demo only, for the dev panel. Any signed-in user. The log lines hold the allowed fields only and the
     *     metrics are counted in this browser tab (architecture.md section 7.7).
     */
    get: operations["getDemoTelemetry"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/_demo/users": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * The seeded demo users
     * @description Demo only, for the role switcher. Answers without `X-Demo-User`, because nobody is picked yet. Each user
     *     is an id, a name, a role and dealership ids, and nothing else (no customer id, phone or email).
     */
    get: operations["getDemoUsers"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/_demo/reset": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Put the demo data back to the seed
     * @description Demo only. Any signed-in user. Everything stored in this browser is replaced by the seed.
     */
    post: operations["resetDemoData"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    Id: string;
    Uuid: string;
    TraceId: string;
    /** @description A UTC instant, `2026-11-03T09:00:00Z`. */
    Instant: string;
    /** @description A date in the dealership's zone, `YYYY-MM-DD`. */
    LocalDate: string;
    /** @description A clock time in the dealership's zone, `HH:mm`. */
    LocalTime: string;
    /** @description An IANA zone name such as `Europe/London`. */
    TimeZone: string;
    /** @enum {string} */
    Transport: "wait" | "drop_off" | "courtesy_car";
    /** @enum {string} */
    Role: "customer" | "staff" | "manager";
    /** @enum {string} */
    UnavailableReason:
      | "TECHNICIAN_BUSY"
      | "NO_QUALIFIED_TECHNICIAN_ON_SHIFT"
      | "BAY_BUSY"
      | "COURTESY_CAR_BUSY"
      | "OUTSIDE_OPENING_HOURS"
      | "DEALERSHIP_CLOSED"
      | "NOT_ON_GRID"
      | "TOO_SOON"
      | "BEYOND_HORIZON";
    Phone: string;
    Email: string;
    Registration: string;
    PersonName: string;
    TimeSlot: {
      start: components["schemas"]["Instant"];
      end: components["schemas"]["Instant"];
    };
    FieldError: {
      field: string;
      message: string;
    };
    /** @description RFC 9457 problem details with a fixed `code` and the `traceId`. */
    Problem: {
      type: string;
      title: string;
      status: number;
      /** @enum {string} */
      code:
        | "VALIDATION_FAILED"
        | "IDEMPOTENCY_KEY_MISSING"
        | "IDEMPOTENCY_KEY_REUSED"
        | "UNKNOWN_USER"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "SLOT_UNAVAILABLE"
        | "CHANGE_WINDOW_CLOSED"
        | "ALREADY_CANCELLED"
        | "SEARCH_RANGE_TOO_LARGE"
        | "INTERNAL";
      detail?: string;
      traceId: components["schemas"]["TraceId"];
      /** @description With `VALIDATION_FAILED`: one entry for each field that is missing or wrong. */
      errors?: components["schemas"]["FieldError"][];
      /** @description With `SLOT_UNAVAILABLE`. */
      reasons?: components["schemas"]["UnavailableReason"][];
      /** @description With `SLOT_UNAVAILABLE`. Other times that are free, nearest first. May be empty. */
      suggestions?: components["schemas"]["TimeSlot"][];
    };
    Me: {
      userId: components["schemas"]["Id"];
      name: string;
      role: components["schemas"]["Role"];
      customerId: components["schemas"]["Id"] | null;
      dealershipIds: components["schemas"]["Id"][];
    };
    DemoUserListing: {
      id: components["schemas"]["Id"];
      name: string;
      role: components["schemas"]["Role"];
      dealershipIds: components["schemas"]["Id"][];
    };
    OpeningHours: {
      open: components["schemas"]["LocalTime"];
      close: components["schemas"]["LocalTime"];
    };
    /** @description Opening hours by weekday, `1` Monday to `7` Sunday. A missing weekday is closed. */
    WeeklyHours: {
      1?: components["schemas"]["OpeningHours"];
      2?: components["schemas"]["OpeningHours"];
      3?: components["schemas"]["OpeningHours"];
      4?: components["schemas"]["OpeningHours"];
      5?: components["schemas"]["OpeningHours"];
      6?: components["schemas"]["OpeningHours"];
      7?: components["schemas"]["OpeningHours"];
    };
    /** @description The word `closed`, or the day's own hours. */
    DateOverride: "closed" | components["schemas"]["OpeningHours"];
    /** @description Opening hours for single dates, by local date. */
    DateOverrides: {
      [key: string]: components["schemas"]["DateOverride"];
    };
    Policies: {
      leadTimeMinutes: number;
      horizonDays: number;
      breakMinutes: number;
      gridMinutes: number;
    };
    Dealership: {
      id: components["schemas"]["Id"];
      name: string;
      timeZone: components["schemas"]["TimeZone"];
      /** @description Shown to customers who are told to call the dealership. */
      phone?: string;
      weeklyHours: components["schemas"]["WeeklyHours"];
      dateOverrides: components["schemas"]["DateOverrides"];
      policies: components["schemas"]["Policies"];
    };
    ServiceType: {
      id: components["schemas"]["Id"];
      name: string;
      durationMinutes: number;
      requiredSkill: string;
    };
    Shift: {
      start: components["schemas"]["LocalTime"];
      end: components["schemas"]["LocalTime"];
      breakStart?: components["schemas"]["LocalTime"];
      breakEnd?: components["schemas"]["LocalTime"];
    };
    /** @description The weekly pattern by weekday, `1` Monday to `7` Sunday. A missing weekday is a day off. */
    ShiftPattern: {
      1?: components["schemas"]["Shift"];
      2?: components["schemas"]["Shift"];
      3?: components["schemas"]["Shift"];
      4?: components["schemas"]["Shift"];
      5?: components["schemas"]["Shift"];
      6?: components["schemas"]["Shift"];
      7?: components["schemas"]["Shift"];
    };
    /** @description Leave for the date, or a changed shift for the date. */
    ShiftException:
      | {
          /** @enum {string} */
          kind: "leave";
        }
      | {
          /** @enum {string} */
          kind: "changed";
          shift: components["schemas"]["Shift"];
        };
    /** @description Date exceptions by local date. */
    ShiftExceptions: {
      [key: string]: components["schemas"]["ShiftException"];
    };
    BookedInterval: {
      appointmentId: components["schemas"]["Id"];
      start: components["schemas"]["Instant"];
      end: components["schemas"]["Instant"];
    };
    Technician: {
      id: components["schemas"]["Id"];
      dealershipId: components["schemas"]["Id"];
      name: string;
      active: boolean;
      skills: string[];
      shiftPattern: components["schemas"]["ShiftPattern"];
      shiftExceptions: components["schemas"]["ShiftExceptions"];
      /** @description The technician's booked times between `from` and `to`. */
      booked: components["schemas"]["BookedInterval"][];
    };
    ServiceBay: {
      id: components["schemas"]["Id"];
      dealershipId: components["schemas"]["Id"];
      name: string;
      active: boolean;
    };
    Vehicle: {
      id: components["schemas"]["Id"];
      customerId: components["schemas"]["Id"];
      registration: string;
      make: string;
      model: string;
      year?: number;
    };
    CustomerWithVehicles: {
      id: components["schemas"]["Id"];
      name: string;
      phone: string;
      email: string;
      vehicles: components["schemas"]["Vehicle"][];
    };
    Availability: {
      date: components["schemas"]["LocalDate"];
      timeZone: components["schemas"]["TimeZone"];
      gridMinutes: number;
      slots: components["schemas"]["TimeSlot"][];
    };
    /** @description Free (with the chosen resources) or taken (with reasons and suggestions). */
    AvailabilityCheck:
      | {
          /** @enum {boolean} */
          available: true;
          technicianId: components["schemas"]["Id"];
          serviceBayId: components["schemas"]["Id"];
          courtesyCarId: components["schemas"]["Id"] | null;
        }
      | {
          /** @enum {boolean} */
          available: false;
          reasons: components["schemas"]["UnavailableReason"][];
          suggestions: components["schemas"]["TimeSlot"][];
        };
    AppointmentFlag: {
      /** @enum {string} */
      kind: "outside_opening_hours" | "outside_shift";
      since: components["schemas"]["Instant"];
      /** @description One short phrase that says why, for example "Ends after Oliver's shift, 13:00" */
      reason: string;
    };
    /**
     * @description What a screen shows for the appointment. `serviceBayName` and `customerName` are for staff and
     *     managers only. `technicianName` is also sent to the customer who owns the appointment.
     */
    AppointmentDisplay: {
      serviceTypeName: string;
      vehicle: {
        registration: string;
        make: string;
        model: string;
      };
      technicianName?: string;
      serviceBayName?: string;
      customerName?: string;
      /** @description The courtesy car's name, when the appointment has one. */
      courtesyCarName?: string;
    };
    /** @description The technician or bay the booking rule picked because the old one was busy. */
    PickedResources: {
      technicianId?: components["schemas"]["Id"];
      serviceBayId?: components["schemas"]["Id"];
    };
    Appointment: {
      id: components["schemas"]["Id"];
      dealershipId: components["schemas"]["Id"];
      timeZone: components["schemas"]["TimeZone"];
      customerId: components["schemas"]["Id"];
      vehicleId: components["schemas"]["Id"];
      serviceTypeId: components["schemas"]["Id"];
      technicianId: components["schemas"]["Id"];
      serviceBayId: components["schemas"]["Id"];
      courtesyCarId: components["schemas"]["Id"] | null;
      transport: components["schemas"]["Transport"];
      start: components["schemas"]["Instant"];
      end: components["schemas"]["Instant"];
      /** @enum {string} */
      status: "confirmed" | "cancelled";
      flags: components["schemas"]["AppointmentFlag"][];
      version: number;
      createdAt: components["schemas"]["Instant"];
      updatedAt: components["schemas"]["Instant"];
      cancelledAt: components["schemas"]["Instant"] | null;
      display: components["schemas"]["AppointmentDisplay"];
      /** @description Only on a manager's move (`PATCH /appointments/{appointmentId}`). */
      picked?: components["schemas"]["PickedResources"];
    };
    ScheduleTechnician: {
      id: components["schemas"]["Id"];
      name: string;
      skills: string[];
      onLeave: boolean;
      /** @description The shift that day, or null when the technician does not work that day. */
      shift: components["schemas"]["TimeSlot"] | null;
      /** @description The shift's break, when it has one. */
      break: components["schemas"]["TimeSlot"] | null;
      /** @description Free windows of 30 minutes or longer, earliest first. None in the past. */
      free: components["schemas"]["TimeSlot"][];
    };
    ScheduleDay: {
      date: components["schemas"]["LocalDate"];
      timeZone: components["schemas"]["TimeZone"];
      /** @description The opening hours that day, or null when the dealership is closed. */
      opening: components["schemas"]["TimeSlot"] | null;
      /** @description The next date the dealership is open, within a month. */
      nextOpenDate: components["schemas"]["LocalDate"] | null;
      technicians: components["schemas"]["ScheduleTechnician"][];
      serviceBays: components["schemas"]["ServiceBay"][];
      /** @description The appointments that start that day, not cancelled, in start order. */
      appointments: components["schemas"]["Appointment"][];
    };
    FlaggedResult: {
      /** @description The appointments that are flagged after the change. */
      flagged: components["schemas"]["Appointment"][];
    };
    OutboxMessageLinks: {
      cancel: string;
      reschedule: string;
    };
    /** @description Ids only; a real sender looks the contact details up when it sends. */
    OutboxMessage: {
      id: components["schemas"]["Id"];
      appointmentId: components["schemas"]["Id"];
      dealershipId: components["schemas"]["Id"];
      kind: string;
      dueAt: components["schemas"]["Instant"];
      /** @description When the message was made. */
      createdAt: components["schemas"]["Instant"];
      /** @description The start of the appointment at the time the message was made. */
      forStart: components["schemas"]["Instant"];
      /** @enum {string} */
      status: "pending" | "sent" | "cancelled";
      links: components["schemas"]["OutboxMessageLinks"];
    };
    NewCustomer: {
      name?: components["schemas"]["PersonName"];
      phone?: components["schemas"]["Phone"];
      email?: components["schemas"]["Email"];
    };
    NewVehicle: {
      registration?: components["schemas"]["Registration"];
      make?: string;
      model?: string;
      year?: number;
    };
    /**
     * @description No field is marked required here on purpose: the server names every missing field in one 422
     *     answer. A booking needs `dealershipId`, `serviceTypeId`, `start`, `transport` and a vehicle:
     *     `vehicleId`, or `newVehicle` (with `customerId` for an existing customer, or with `newCustomer`).
     *     Staff and managers send `customerId` or `newCustomer`; a customer sends neither `newCustomer`,
     *     `newVehicle` nor `technicianId`.
     */
    BookingRequest: {
      dealershipId?: components["schemas"]["Id"];
      serviceTypeId?: components["schemas"]["Id"];
      start?: components["schemas"]["Instant"];
      transport?: components["schemas"]["Transport"];
      customerId?: components["schemas"]["Id"];
      vehicleId?: components["schemas"]["Id"];
      newCustomer?: components["schemas"]["NewCustomer"];
      newVehicle?: components["schemas"]["NewVehicle"];
      technicianId?: components["schemas"]["Id"];
    };
    AvailabilityCheckRequest: {
      dealershipId: components["schemas"]["Id"];
      serviceTypeId: components["schemas"]["Id"];
      start: components["schemas"]["Instant"];
      transport: components["schemas"]["Transport"];
      technicianId?: components["schemas"]["Id"];
      appointmentId?: components["schemas"]["Id"];
    };
    RescheduleRequest: {
      start: components["schemas"]["Instant"];
    };
    AdjustRequest: {
      start?: components["schemas"]["Instant"];
      technicianId?: components["schemas"]["Id"];
      serviceBayId?: components["schemas"]["Id"];
    };
    /** @description The whole settings are sent together. The time zone and the start-time grid cannot be changed. */
    SettingsRequest: {
      weeklyHours: components["schemas"]["WeeklyHours"];
      dateOverrides: components["schemas"]["DateOverrides"];
      policies: {
        leadTimeMinutes: number;
        horizonDays: number;
        breakMinutes: number;
      };
    };
    ShiftsRequest: {
      shiftPattern: components["schemas"]["ShiftPattern"];
      shiftExceptions: components["schemas"]["ShiftExceptions"];
    };
    /**
     * @description Either `text` (3 to 50 characters), or `phone` and/or `registration` for the same number (digits only) or plate (letters and numbers).
     *     Never both kinds in one request.
     */
    CustomerSearchRequest: {
      text?: string;
      phone?: components["schemas"]["Phone"];
      registration?: components["schemas"]["Registration"];
    };
    /** @description One JSON log line. Only these fields can appear (architecture.md section 7.7). */
    LogLine: {
      ts: components["schemas"]["Instant"];
      /** @enum {string} */
      level: "info" | "error";
      msg: string;
      traceId?: components["schemas"]["TraceId"];
      route?: string;
      method?: string;
      status?: number;
      durationMs?: number;
      dealershipId?: components["schemas"]["Id"];
      actorRole?: components["schemas"]["Role"];
      outcome?: string;
      code?: string;
      reasons?: string[];
      appointmentId?: components["schemas"]["Id"];
      technicianId?: components["schemas"]["Id"];
      serviceBayId?: components["schemas"]["Id"];
      candidates?: number;
    };
    MetricLabels: {
      [key: string]: string;
    };
    MetricSample: {
      name: string;
      labels: components["schemas"]["MetricLabels"];
      value: number;
    };
    HistogramSample: {
      name: string;
      labels: components["schemas"]["MetricLabels"];
      count: number;
      sum: number;
      p50: number;
      p95: number;
      max: number;
    };
    Telemetry: {
      logs: components["schemas"]["LogLine"][];
      counters: components["schemas"]["MetricSample"][];
      histograms: components["schemas"]["HistogramSample"][];
      /** @description Worked out when read, for example `bay_utilisation_ratio`. */
      gauges: components["schemas"]["MetricSample"][];
    };
  };
  responses: {
    /** @description No `X-Demo-User`, or one that is not a known user. */
    Unauthorized: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description The role or the dealership may not do this. */
    Forbidden: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description There is no such record, or it is another customer's. */
    NotFound: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description A field is missing or wrong (`VALIDATION_FAILED` with `errors`), a key was reused, or a date range is too large. */
    ValidationFailed: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description The `Idempotency-Key` header is missing. */
    IdempotencyKeyMissing: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description The time cannot be booked now. `reasons` and `suggestions` are always present. */
    SlotUnavailable: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /**
     * @description `SLOT_UNAVAILABLE` (the new time is taken), `CHANGE_WINDOW_CLOSED` (a customer after the cutoff)
     *     or `ALREADY_CANCELLED`.
     */
    ConflictOnChange: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description `SLOT_UNAVAILABLE` (the new time is taken) or `ALREADY_CANCELLED`. */
    SlotUnavailableOrCancelled: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description `CHANGE_WINDOW_CLOSED`: a customer after the cutoff. */
    ChangeWindowClosed: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
    /** @description Anything unexpected. The body never says how the system is built. */
    Internal: {
      headers: {
        "X-Trace-Id": components["headers"]["TraceId"];
        [name: string]: unknown;
      };
      content: {
        "application/problem+json": components["schemas"]["Problem"];
      };
    };
  };
  parameters: {
    /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
    Traceparent: string;
    /** @description One UUID per Confirm press. The same key and body again gives the saved answer. */
    IdempotencyKey: components["schemas"]["Uuid"];
    DealershipId: components["schemas"]["Id"];
    AppointmentId: components["schemas"]["Id"];
    /** @description When true, work out what would be flagged and save nothing. */
    Preview: boolean;
  };
  requestBodies: never;
  headers: {
    /** @description The trace id the request was handled under, 32 lower-case hex characters. */
    TraceId: components["schemas"]["TraceId"];
  };
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getMe: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The current user. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Me"];
        };
      };
      401: components["responses"]["Unauthorized"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listDealerships: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The dealerships, by id. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Dealership"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  getDealership: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The dealership. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Dealership"];
        };
      };
      401: components["responses"]["Unauthorized"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  updateDealershipSettings: {
    parameters: {
      query?: {
        /** @description When true, work out what would be flagged and save nothing. */
        preview?: components["parameters"]["Preview"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SettingsRequest"];
      };
    };
    responses: {
      /** @description Saved (or previewed). The appointments that are flagged after the change. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["FlaggedResult"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listServiceTypes: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The service types, by id. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceType"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listTechnicians: {
    parameters: {
      query: {
        from: components["schemas"]["LocalDate"];
        to: components["schemas"]["LocalDate"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The technicians, by id. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Technician"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  updateTechnicianShifts: {
    parameters: {
      query?: {
        /** @description When true, work out what would be flagged and save nothing. */
        preview?: components["parameters"]["Preview"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        technicianId: components["schemas"]["Id"];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ShiftsRequest"];
      };
    };
    responses: {
      /** @description Saved (or previewed). The appointments that are flagged after the change. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["FlaggedResult"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listServiceBays: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The bays, by id. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceBay"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  getScheduleDay: {
    parameters: {
      query: {
        date: components["schemas"]["LocalDate"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The day. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ScheduleDay"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  searchAvailability: {
    parameters: {
      query: {
        serviceTypeId: components["schemas"]["Id"];
        date: components["schemas"]["LocalDate"];
        transport: components["schemas"]["Transport"];
        technicianId?: components["schemas"]["Id"];
        appointmentId?: components["schemas"]["Id"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        dealershipId: components["parameters"]["DealershipId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The free start times. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Availability"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  checkAvailability: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["AvailabilityCheckRequest"];
      };
    };
    responses: {
      /** @description Free, or taken with reasons and suggestions. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AvailabilityCheck"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listAppointments: {
    parameters: {
      query?: {
        dealershipId?: components["schemas"]["Id"];
        date?: components["schemas"]["LocalDate"];
        flagged?: boolean;
        includeCancelled?: boolean;
        includePast?: boolean;
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The appointments, with a `display` block. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  bookAppointment: {
    parameters: {
      query?: never;
      header: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
        /** @description One UUID per Confirm press. The same key and body again gives the saved answer. */
        "Idempotency-Key": components["parameters"]["IdempotencyKey"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["BookingRequest"];
      };
    };
    responses: {
      /** @description Booked. */
      201: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"];
        };
      };
      400: components["responses"]["IdempotencyKeyMissing"];
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      409: components["responses"]["SlotUnavailable"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  getAppointment: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        appointmentId: components["parameters"]["AppointmentId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The appointment. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"];
        };
      };
      401: components["responses"]["Unauthorized"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  adjustAppointment: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        appointmentId: components["parameters"]["AppointmentId"];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["AdjustRequest"];
      };
    };
    responses: {
      /** @description Changed. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      409: components["responses"]["SlotUnavailableOrCancelled"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  rescheduleAppointment: {
    parameters: {
      query?: never;
      header: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
        /** @description One UUID per Confirm press. The same key and body again gives the saved answer. */
        "Idempotency-Key": components["parameters"]["IdempotencyKey"];
      };
      path: {
        appointmentId: components["parameters"]["AppointmentId"];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RescheduleRequest"];
      };
    };
    responses: {
      /** @description Moved. Same id, new time, `version` raised. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"];
        };
      };
      400: components["responses"]["IdempotencyKeyMissing"];
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      409: components["responses"]["ConflictOnChange"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  cancelAppointment: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        appointmentId: components["parameters"]["AppointmentId"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Cancelled. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Appointment"];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      409: components["responses"]["ChangeWindowClosed"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  searchCustomers: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CustomerSearchRequest"];
      };
    };
    responses: {
      /** @description The matching customers with their vehicles. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["CustomerWithVehicles"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listCustomerVehicles: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path: {
        customerId: components["schemas"]["Id"];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The vehicles, by id. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Vehicle"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  listOutbox: {
    parameters: {
      query?: {
        dealershipId?: components["schemas"]["Id"];
        appointmentId?: components["schemas"]["Id"];
      };
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The messages. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["OutboxMessage"][];
        };
      };
      401: components["responses"]["Unauthorized"];
      403: components["responses"]["Forbidden"];
      404: components["responses"]["NotFound"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  getDemoTelemetry: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The newest log lines (at most 500) and the metrics. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["Telemetry"];
        };
      };
      401: components["responses"]["Unauthorized"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  getDemoUsers: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Every seeded demo user. */
      200: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["DemoUserListing"][];
        };
      };
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
  resetDemoData: {
    parameters: {
      query?: never;
      header?: {
        /** @description W3C trace context, `00-<32 hex>-<16 hex>-<2 hex>`. A value that does not match is ignored and a new trace id is made. */
        traceparent?: components["parameters"]["Traceparent"];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Reset. */
      204: {
        headers: {
          "X-Trace-Id": components["headers"]["TraceId"];
          [name: string]: unknown;
        };
        content?: never;
      };
      401: components["responses"]["Unauthorized"];
      422: components["responses"]["ValidationFailed"];
      500: components["responses"]["Internal"];
    };
  };
}
