import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { chatSessions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./authRoutes";
import { generateChatReply, type ChatHistoryMsg } from "./chatService";

const sendMessageSchema = z.object({
  sessionId: z.string().nullable(),
  message: z.string().min(1).max(5000),
  pageUrl: z.string().nullable().optional(),
  hasScreenshot: z.boolean().optional(),
});

export function registerChatRoutes(app: Express) {
  app.post(
    "/api/chat/message",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.session as any)?.userId as number | undefined;
        if (!userId) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        const parsed = sendMessageSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Invalid request body",
            errors: parsed.error.flatten(),
          });
        }
        const { sessionId, message } = parsed.data;

        // Load or create chat session
        let session = sessionId
          ? (
              await db
                .select()
                .from(chatSessions)
                .where(eq(chatSessions.id, sessionId))
                .limit(1)
            )[0]
          : undefined;

        if (!session) {
          const [created] = await db
            .insert(chatSessions)
            .values({ userId, messages: [] })
            .returning();
          session = created;
        } else if (session.userId !== userId) {
          return res
            .status(403)
            .json({ message: "Session does not belong to this user" });
        }

        const existing: ChatHistoryMsg[] = Array.isArray(session.messages)
          ? (session.messages as ChatHistoryMsg[])
          : [];

        const userMsg: ChatHistoryMsg = {
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
        };
        const historyForAi = [...existing, userMsg];

        let aiResult;
        try {
          aiResult = await generateChatReply(historyForAi);
        } catch (err: any) {
          console.error("[chat] OpenAI call failed:", err?.message ?? err);
          // Persist the user message even if AI fails so it's not lost
          await db
            .update(chatSessions)
            .set({ messages: historyForAi })
            .where(eq(chatSessions.id, session.id));
          return res.status(503).json({
            message:
              "Sorry, I had trouble responding. Please try again.",
          });
        }

        const assistantMsg: ChatHistoryMsg = {
          role: "assistant",
          content: aiResult.reply,
          timestamp: new Date().toISOString(),
        };
        const updatedMessages = [...historyForAi, assistantMsg];

        await db
          .update(chatSessions)
          .set({ messages: updatedMessages })
          .where(eq(chatSessions.id, session.id));

        return res.json({
          reply: aiResult.reply,
          sessionId: session.id,
          shouldSubmit: aiResult.shouldSubmit,
          submissionDraft: aiResult.submissionDraft,
        });
      } catch (err: any) {
        console.error("[chat] /api/chat/message error:", err?.message ?? err);
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  );
}
