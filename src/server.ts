import express, {
  Request,
  Response,
  NextFunction
} from "express";

import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics
} from "prom-client";

const app = express();

app.use(express.json());

const register = new Registry();

collectDefaultMetrics({
  register
});

const requestCounter = new Counter({
  name: "api_requests_total",
  help: "Total API requests",
  labelNames: ["route", "method", "status"],
  registers: [register]
});

const requestDuration = new Histogram({
  name: "api_request_duration_seconds",
  help: "Request latency",
  labelNames: ["route", "method", "status"],
  buckets: [
    0.1,
    0.25,
    0.5,
    1,
    2,
    5,
    10
  ],
  registers: [register]
});

let requestSequence = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

/*
  Requests 1-90  -> 200ms
  Requests 91-99 -> 1000ms
  Request 100    -> 5000ms

  Repeats forever.
*/
function getDeterministicLatency(): number {

  requestSequence++;

  const position =
    ((requestSequence - 1) % 100) + 1;

  if (position === 100) {
    return 5000;
  }

  if (position >= 91) {
    return 1000;
  }

  return 200;
}

function instrument(route: string) {

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {

    const latency = getDeterministicLatency();

    const endTimer =
      requestDuration.startTimer();

    await sleep(latency);

    res.on("finish", () => {

      requestCounter.inc({
        route,
        method: req.method,
        status: String(res.statusCode)
      });

      endTimer({
        route,
        method: req.method,
        status: String(res.statusCode)
      });
    });

    next();
  };
}

app.get(
  "/health",
  instrument("/health"),
  (_req: Request, res: Response) => {

    res.json({
      status: "UP",
      requestSequence
    });
  }
);

app.get(
  "/users",
  instrument("/users"),
  (_req: Request, res: Response) => {

    res.json([
      {
        id: 1,
        name: "Alice"
      },
      {
        id: 2,
        name: "Bob"
      }
    ]);
  }
);

app.post(
  "/predict",
  instrument("/predict"),
  (_req: Request, res: Response) => {

    res.json({
      prediction: "positive",
      requestSequence
    });
  }
);

app.get(
  "/metrics",
  async (_req: Request, res: Response) => {

    res.setHeader(
      "Content-Type",
      register.contentType
    );

    res.end(
      await register.metrics()
    );
  }
);

const PORT = 3008;

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Listening on port ${PORT}`
  );
});