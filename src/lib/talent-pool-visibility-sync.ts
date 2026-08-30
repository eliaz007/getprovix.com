import type { SupabaseClient } from "@supabase/supabase-js";

export const TALENT_POOL_VISIBILITY_CHANNEL = "talent-pool-visibility";
export const TALENT_POOL_VISIBILITY_EVENT = "visibility";
const LOCAL_CHANNEL = "provix-talent-pool-visibility";

export type TalentPoolVisibilityChange = {
  profileId: string;
  visible: boolean;
};

export function parseTalentPoolVisibilityChange(
  value: unknown
): TalentPoolVisibilityChange | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const profileId =
    typeof record.profileId === "string" ? record.profileId.trim() : "";
  if (!profileId) {
    return null;
  }

  return {
    profileId,
    visible: Boolean(record.visible),
  };
}

export function publishLocalTalentPoolVisibility(
  change: TalentPoolVisibilityChange
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const channel = new BroadcastChannel(LOCAL_CHANNEL);
    channel.postMessage(change);
    channel.close();
  } catch {
    // BroadcastChannel is unavailable in some embedded browsers.
  }

  try {
    localStorage.setItem(LOCAL_CHANNEL, JSON.stringify(change));
    localStorage.removeItem(LOCAL_CHANNEL);
  } catch {
    // Private mode may block storage events.
  }
}

export function subscribeLocalTalentPoolVisibility(
  handler: (change: TalentPoolVisibilityChange) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(LOCAL_CHANNEL);
    channel.onmessage = (event) => {
      const parsed = parseTalentPoolVisibilityChange(event.data);
      if (parsed) {
        handler(parsed);
      }
    };
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== LOCAL_CHANNEL || !event.newValue) {
      return;
    }

    try {
      const parsed = parseTalentPoolVisibilityChange(JSON.parse(event.newValue));
      if (parsed) {
        handler(parsed);
      }
    } catch {
      // Ignore malformed storage payloads.
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}

function findTalentPoolVisibilityChannel(supabase: SupabaseClient) {
  return supabase
    .getChannels()
    .find((channel) => channel.topic.includes(TALENT_POOL_VISIBILITY_CHANNEL));
}

export function ensureTalentPoolVisibilityChannel(
  supabase: SupabaseClient
): () => void {
  const existing = findTalentPoolVisibilityChannel(supabase);
  if (existing) {
    return () => {};
  }

  const channel = supabase.channel(TALENT_POOL_VISIBILITY_CHANNEL).subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

async function sendTalentPoolVisibility(
  supabase: SupabaseClient,
  change: TalentPoolVisibilityChange
) {
  const existing = findTalentPoolVisibilityChannel(supabase);
  if (existing) {
    await existing.send({
      type: "broadcast",
      event: TALENT_POOL_VISIBILITY_EVENT,
      payload: change,
    });
    return;
  }

  const channel = supabase.channel(TALENT_POOL_VISIBILITY_CHANNEL, {
    config: { broadcast: { ack: true } },
  });

  try {
    const subscribed = await new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => resolve(false), 2000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timeoutId);
          resolve(true);
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          window.clearTimeout(timeoutId);
          resolve(false);
        }
      });
    });

    if (subscribed) {
      await channel.send({
        type: "broadcast",
        event: TALENT_POOL_VISIBILITY_EVENT,
        payload: change,
      });
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}

export async function publishTalentPoolVisibility(
  supabase: SupabaseClient,
  change: TalentPoolVisibilityChange
): Promise<void> {
  publishLocalTalentPoolVisibility(change);

  try {
    await sendTalentPoolVisibility(supabase, change);
  } catch (error) {
    console.warn("Talent pool visibility broadcast failed:", error);
  }
}

export function subscribeTalentPoolVisibility(
  supabase: SupabaseClient,
  handler: (change: TalentPoolVisibilityChange) => void
): () => void {
  const unsubscribeLocal = subscribeLocalTalentPoolVisibility(handler);

  const channel = supabase
    .channel(TALENT_POOL_VISIBILITY_CHANNEL)
    .on(
      "broadcast",
      { event: TALENT_POOL_VISIBILITY_EVENT },
      ({ payload }) => {
        const parsed = parseTalentPoolVisibilityChange(payload);
        if (parsed) {
          handler(parsed);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "profiles" },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id?.trim();
        if (id) {
          handler({ profileId: id, visible: false });
        }
      }
    )
    .subscribe();

  return () => {
    unsubscribeLocal();
    void supabase.removeChannel(channel);
  };
}
