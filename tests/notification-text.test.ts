import { describe, expect, it } from "vitest";
import { notificationText } from "@/lib/notification-text";

describe("notificationText", () => {
  it("builds level-up texts in both languages", () => {
    const n = { type: "LEVEL_UP", title: "Level 5 Reached!", message: "x", params: { level: 5 } };
    expect(notificationText(n, "tr").title).toBe("Seviye 5'e ulaştın!");
    expect(notificationText(n, "en").title).toBe("Level 5 Reached!");
  });

  it("uses the Turkish badge name when known", () => {
    const n = { type: "BADGE_EARNED", title: "Badge Unlocked: Debate Starter", message: "d", params: { badge: "first-debate", name: "Debate Starter" } };
    expect(notificationText(n, "tr").title).toBe("Rozet kazandın: Tartışma Başlatan");
    const unknown = { ...n, params: { badge: "no-such-badge", name: "Custom", description: "Custom desc" } };
    expect(notificationText(unknown, "tr")).toEqual({ title: "Rozet kazandın: Custom", message: "Custom desc" });
  });

  it("keeps the user's comment text and translates the heading", () => {
    const n = { type: "COMMENT_ON_DEBATE", title: "ayse commented on \"Goku\"", message: "harika fikir", params: { actor: "ayse", target: "Goku" } };
    expect(notificationText(n, "tr")).toEqual({ title: 'ayse, "Goku" için yorum yaptı', message: "harika fikir" });
  });

  it("falls back to the stored text for old rows", () => {
    const n = { type: "LEVEL_UP", title: "Level 3 Reached!", message: "old", params: null };
    expect(notificationText(n, "tr")).toEqual({ title: "Level 3 Reached!", message: "old" });
  });
});
