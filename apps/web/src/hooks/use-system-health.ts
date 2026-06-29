"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HealthResponse, TelemetryEvent } from "@sovereign/shared";
import { fetchHealth, getWsUrl } from "@/lib/api";

export type ConnectionStatus = "live" | "degraded" | "offline";

function mapHealthStatus(apiStatus: string | undefined): ConnectionStatus {
  if (apiStatus === "online") return "live";
  if (apiStatus === "degraded") return "degraded";
  return "offline";
}

export function useSystemHealth(pollMs = 15000) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [wsConnected, setWsConnected] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const initialPoll = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      setLastFetchAt(new Date());
      setStatus(mapHealthStatus(data.status));
    } catch {
      if (!initialPoll.current) {
        setHealth(null);
      }
      setStatus("offline");
    } finally {
      initialPoll.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  return { health, status, wsConnected, setWsConnected, lastFetchAt, refresh };
}

export function useTelemetry(onEvent?: (event: TelemetryEvent) => void) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setConnected(true);
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as TelemetryEvent;
          if (event.agent === "HEARTBEAT") return;
          setEvents((prev) => [...prev.slice(-499), event]);
          onEvent?.(event);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25000);

    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [onEvent]);

  return { events, connected, clear: () => setEvents([]) };
}
