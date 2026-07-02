"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Workspace = { id: string; name: string };
type SharedThesis = {
  id: string;
  ticker: string;
  status: string;
  analysis_id?: string | null;
};

export function WorkspacesPanel() {
  const role = "admin";
  const canWrite = true;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [theses, setTheses] = useState<SharedThesis[]>([]);
  const [name, setName] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [thesisId, setThesisId] = useState("");

  useEffect(() => {
    apiFetch<{ workspaces: Workspace[] }>("/api/workspaces")
      .then((d) => setWorkspaces(d.workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    apiFetch<{ shared_theses: SharedThesis[] }>(`/api/workspaces/${selected}`)
      .then((d) => setTheses(d.shared_theses))
      .catch(() => setTheses([]));
  }, [selected]);

  async function createWorkspace() {
    if (!name.trim()) return;
    const ws = await apiFetch<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setWorkspaces((prev) => [...prev, ws]);
    setName("");
  }

  async function addAnnotation() {
    if (!selected || !thesisId || !annotation.trim()) return;
    await apiFetch(`/api/workspaces/${selected}/annotations`, {
      method: "POST",
      body: JSON.stringify({ thesis_id: thesisId, content: annotation }),
    });
    setAnnotation("");
  }

  async function requestApproval(thesis: SharedThesis) {
    if (!selected) return;
    await apiFetch(`/api/workspaces/${selected}/approvals`, {
      method: "POST",
      body: JSON.stringify({
        resource_type: "shared_thesis",
        resource_id: thesis.id,
      }),
    });
    const detail = await apiFetch<{ shared_theses: SharedThesis[] }>(
      `/api/workspaces/${selected}`,
    );
    setTheses(detail.shared_theses);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm font-semibold">Team workspaces</h2>
        <Badge variant="outline" className="text-[10px] uppercase">
          {role ?? "viewer"}
        </Badge>
      </div>

      {canWrite && (
        <div className="flex gap-2">
          <Input
            placeholder="New workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={createWorkspace}>
            Create
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {workspaces.map((ws) => (
          <Button
            key={ws.id}
            size="sm"
            variant={selected === ws.id ? "default" : "outline"}
            onClick={() => setSelected(ws.id)}
          >
            {ws.name}
          </Button>
        ))}
      </div>

      {selected && (
        <Card className="p-4">
          <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Shared theses
          </h3>
          <ul className="space-y-2">
            {theses.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span>
                  {t.ticker}{" "}
                  <Badge variant="secondary" className="ml-1 text-[9px]">
                    {t.status}
                  </Badge>
                </span>
                {canWrite && t.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => requestApproval(t)}>
                    Request approval
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {canWrite && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Input
                placeholder="Thesis ID"
                value={thesisId}
                onChange={(e) => setThesisId(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Annotation"
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={addAnnotation}>
                Add annotation
              </Button>
            </div>
          )}
        </Card>
      )}

      <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
        Manage org members in Settings
      </Link>
    </div>
  );
}
