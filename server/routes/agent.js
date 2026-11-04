/**
 * routes/agent.js
 *
 * Express routes for the Genuine AI Agent (Milestone 4 — Part B).
 *
 * Exposes:
 *  POST /api/agent/chat — Accepts user message and optional conversation history,
 *                         runs the OpenAI tool-calling loop, and returns the response.
 */

'use strict';

const express = require('express');
const router = express.Router();
const {
  runAgent,
  validateConversationHistory,
  MAX_MESSAGE_LENGTH,
} = require('../services/agentService');

// POST /api/agent/chat — Execute multi-turn AI agent conversation
router.post('/chat', async (req, res, next) => {
  try {
    const { message, conversationHistory = [] } = req.body || {};

    // 1. Validate user message
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'The "message" field is required and must be a string.',
        },
      });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_MESSAGE',
          message: 'The "message" field cannot be empty or whitespace only.',
        },
      });
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MESSAGE_TOO_LONG',
          message: `The "message" field exceeds maximum permitted length of ${MAX_MESSAGE_LENGTH} characters.`,
        },
      });
    }

    // 2. Validate conversation history using existing safeguards
    const historyValidation = validateConversationHistory(conversationHistory);
    if (!historyValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: historyValidation.error.code,
          message: historyValidation.error.message,
        },
      });
    }

    // 3. Resolve options (support injected test client and test database via req.app.locals)
    const options = {
      client: req.app && req.app.locals ? req.app.locals.openAiClient : undefined,
      targetDb: req.app && req.app.locals ? req.app.locals.db : undefined,
    };

    // 4. Run agent tool-calling loop
    const result = await runAgent(trimmedMessage, historyValidation.sanitizedHistory, options);

    if (!result.success) {
      const statusCode = result.error.code === 'MISSING_API_KEY' ? 503 : 500;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
    }

    return res.json({
      success: true,
      reply: result.reply,
      toolExecutions: result.toolExecutions || [],
      iterations: result.iterations || 1,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
