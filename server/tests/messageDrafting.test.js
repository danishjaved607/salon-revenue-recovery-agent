/**
 * tests/messageDrafting.test.js
 *
 * Milestone 3 — Part B: AI Message Drafting & Fallback Templates Tests
 *
 * Uses Node.js built-in test runner (`node:test`) and assertions (`node:assert/strict`).
 * Uses isolated in-memory SQLite database (:memory:) and mocked OpenAI responses.
 * Zero external network calls or API costs.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const {
  createTables,
  seedAll,
} = require('../config/database');

const {
  REQUIRED_CTA,
  buildOfferPrompt,
  generateFallbackMessage,
  draftOfferMessage,
} = require('../services/messageDraftingService');

const {
  OfferError,
  createOffer,
  createOfferAsync,
  updateOfferStatus,
  getOfferById,
} = require('../services/offerService');

function setupTestDb() {
  const memDb = new DatabaseSync(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  createTables(memDb);
  seedAll(memDb);
  return memDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PROMPT BUILDER & FACTUAL CONTEXT SAFETY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part B: Prompt Builder & Context Safety', () => {

  const sampleContext = {
    customer: {
      name: 'Sara Malik',
      phone: '+92-300-1234567',
      email: 'sara.malik@example.com',
      bookingHistory: ['apt-003', 'apt-011'],
    },
    service: {
      id: 'svc-001',
      name: 'Hair Cut & Blow-Dry',
      category: 'hair',
      durationMinutes: 60,
      price: 2500,
      currency: 'PKR',
    },
    appointment: {
      id: 'apt-001',
      date: '2024-11-20',
      startTime: '10:00',
      endTime: '11:00',
    },
    staff: {
      id: 'stf-001',
      name: 'Ayesha Khan',
    },
    waitlist: {
      priority: 1,
      availableTimeSlots: ['morning'],
    },
  };

  it('builds system prompt instructing the model to remain under 220 characters and include required CTA', () => {
    const { systemPrompt } = buildOfferPrompt(sampleContext);

    assert.ok(systemPrompt.includes('Reply YES to confirm or NO to pass.'));
    assert.match(systemPrompt, /under 220 characters/i);
    assert.match(systemPrompt, /treat.*passive factual context/i);
    assert.match(systemPrompt, /never invent discounts/i);
  });

  it('includes verified customer, service, slot, and staff details in user prompt', () => {
    const { userPrompt } = buildOfferPrompt(sampleContext);

    assert.ok(userPrompt.includes('Sara Malik'));
    assert.ok(userPrompt.includes('Hair Cut & Blow-Dry'));
    assert.ok(userPrompt.includes('2500 PKR'));
    assert.ok(userPrompt.includes('2024-11-20'));
    assert.ok(userPrompt.includes('10:00'));
    assert.ok(userPrompt.includes('Ayesha Khan'));
    assert.ok(userPrompt.includes('Returning client'));
    assert.ok(userPrompt.includes('Top priority'));
  });

  it('excludes sensitive customer PII (phone number, email address, raw appointment ID array)', () => {
    const { userPrompt, systemPrompt } = buildOfferPrompt(sampleContext);
    const combined = `${systemPrompt}\n${userPrompt}`;

    assert.ok(!combined.includes('+92-300-1234567'), 'Phone number must never be sent to the model');
    assert.ok(!combined.includes('sara.malik@example.com'), 'Email address must never be sent to the model');
    assert.ok(!combined.includes('apt-003'), 'Raw internal booking IDs must not be sent');
    assert.ok(!combined.includes('apt-011'), 'Raw internal booking IDs must not be sent');
  });

  it('correctly categorizes new vs. returning client in prompt', () => {
    const newClientContext = {
      ...sampleContext,
      customer: { name: 'Dua Hassan', bookingHistory: [] },
    };
    const { userPrompt } = buildOfferPrompt(newClientContext);
    assert.ok(userPrompt.includes('New client'));
    assert.ok(!userPrompt.includes('Returning client'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DETERMINISTIC FALLBACK MESSAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part B: Deterministic Fallback Templates', () => {

  const baseContext = {
    customer: { name: 'Sara Malik', bookingHistory: [] },
    service: { name: 'Gel Manicure', price: 2000, currency: 'PKR' },
    appointment: { date: '2024-11-25', startTime: '14:00' },
    staff: { name: 'Zara Siddiqui' },
    waitlist: { priority: 3 },
  };

  it('generates standard fallback message with all slot details and mandatory CTA', () => {
    const message = generateFallbackMessage(baseContext);

    assert.ok(message.includes('Sara Malik'));
    assert.ok(message.includes('Gel Manicure'));
    assert.ok(message.includes('Zara Siddiqui'));
    assert.ok(message.includes('2024-11-25 at 14:00'));
    assert.ok(message.includes('(2000 PKR)'));
    assert.ok(message.endsWith(REQUIRED_CTA));
    assert.ok(message.length <= 250, `Message length ${message.length} exceeds 250 characters`);
  });

  it('generates returning client fallback message acknowledging prior relationship', () => {
    const returningContext = {
      ...baseContext,
      customer: { name: 'Sara Malik', bookingHistory: ['apt-001'] },
    };
    const message = generateFallbackMessage(returningContext);

    assert.ok(message.startsWith('Welcome back Sara Malik!'));
    assert.ok(message.endsWith(REQUIRED_CTA));
    assert.ok(message.length <= 250);
  });

  it('generates priority waitlist fallback message for priority 1 clients', () => {
    const priorityContext = {
      ...baseContext,
      waitlist: { priority: 1 },
    };
    const message = generateFallbackMessage(priorityContext);

    assert.ok(message.startsWith('Hi Sara Malik, priority waitlist slot available:'));
    assert.ok(message.endsWith(REQUIRED_CTA));
    assert.ok(message.length <= 250);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AI DRAFTING WITH MOCKED OPENAI RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part B: Mocked OpenAI Message Drafting', () => {

  const testContext = {
    customer: { name: 'Sara Malik', bookingHistory: ['apt-001'] },
    service: { name: 'Hair Cut & Blow-Dry', price: 2500, currency: 'PKR' },
    appointment: { date: '2024-11-20', startTime: '10:00' },
    staff: { name: 'Ayesha Khan' },
    waitlist: { priority: 1 },
  };

  it('returns AI-drafted text and sets aiGenerated: true on successful OpenAI completion', async () => {
    const mockAiText = 'Hello Sara! A slot opened for Hair Cut with Ayesha on Nov 20 at 10:00 AM (2500 PKR). Reply YES to confirm or NO to pass.';

    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: mockAiText,
                },
              },
            ],
          }),
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-api-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, true);
    assert.strictEqual(result.messageText, mockAiText);
  });

  it('automatically appends mandatory CTA if the model response omitted it', async () => {
    const mockAiTextWithoutCta = 'Hi Sara! A slot opened with Ayesha for Hair Cut on Nov 20 at 10:00.';

    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: mockAiTextWithoutCta } }],
          }),
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-api-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, true);
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FALLBACK RESILIENCE & ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part B: Fallback Resilience & Error Handling', () => {

  const testContext = {
    customer: { name: 'Sara Malik', bookingHistory: [] },
    service: { name: 'Hair Cut & Blow-Dry', price: 2500, currency: 'PKR' },
    appointment: { date: '2024-11-20', startTime: '10:00' },
    staff: { name: 'Ayesha Khan' },
    waitlist: { priority: 2 },
  };

  it('gracefully falls back when OPENAI_API_KEY is missing or blank', async () => {
    const result = await draftOfferMessage(testContext, { apiKey: '' });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, 'MISSING_API_KEY');
    assert.ok(result.messageText.includes('Hair Cut & Blow-Dry'));
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });

  it('gracefully falls back on network timeout without throwing', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: () => new Promise((resolve) => setTimeout(resolve, 500)), // Hangs longer than timeout
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-api-key',
      client: mockClient,
      timeoutMs: 50, // Short timeout
    });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, 'ETIMEDOUT');
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });

  it('gracefully falls back on HTTP 429 rate limit or quota exhaustion', async () => {
    const rateLimitError = new Error('Rate limit exceeded or quota exhausted.');
    rateLimitError.status = 429;
    rateLimitError.code = 'rate_limit_exceeded';

    const mockClient = {
      chat: {
        completions: {
          create: async () => { throw rateLimitError; },
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-api-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, '429');
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });

  it('gracefully falls back on HTTP 401 unauthorized error', async () => {
    const authError = new Error('Incorrect API key provided.');
    authError.status = 401;

    const mockClient = {
      chat: {
        completions: {
          create: async () => { throw authError; },
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'invalid-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, '401');
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });

  it('gracefully falls back on HTTP 500 server error', async () => {
    const serverError = new Error('Internal server error.');
    serverError.status = 500;

    const mockClient = {
      chat: {
        completions: {
          create: async () => { throw serverError; },
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, '500');
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });

  it('gracefully falls back when OpenAI returns an empty or whitespace-only response', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '   ' } }],
          }),
        },
      },
    };

    const result = await draftOfferMessage(testContext, {
      apiKey: 'test-key',
      client: mockClient,
    });

    assert.strictEqual(result.aiGenerated, false);
    assert.strictEqual(result.reason, 'EMPTY_AI_RESPONSE');
    assert.ok(result.messageText.endsWith(REQUIRED_CTA));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ASYNC OFFER CREATION INTEGRATION & AI FLAG CORRECTNESS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Milestone 3 — Part B: Offer Creation with AI & Fallback Integration', () => {

  it('creates an offer with aiGenerated = 1 when OpenAI successfully drafts the message', async () => {
    const memDb = setupTestDb();

    const mockAiMessage = 'Sara, special opening with Ayesha on Nov 20 at 10:00! Reply YES to confirm or NO to pass.';
    const mockClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: mockAiMessage } }],
          }),
        },
      },
    };

    const offer = await createOfferAsync('apt-001', 'wl-001', {
      openAiApiKey: 'mock-key',
      openAiClient: mockClient,
    }, memDb);

    assert.ok(offer.id);
    assert.strictEqual(offer.status, 'pending_approval');
    assert.strictEqual(offer.aiGenerated, 1, 'aiGenerated flag must be 1 on successful AI drafting');
    assert.strictEqual(offer.messageText, mockAiMessage);

    memDb.close();
  });

  it('creates an offer with aiGenerated = 0 when OpenAI key is missing and uses fallback template', async () => {
    const memDb = setupTestDb();

    const offer = await createOfferAsync('apt-001', 'wl-001', {
      openAiApiKey: '',
    }, memDb);

    assert.ok(offer.id);
    assert.strictEqual(offer.status, 'pending_approval');
    assert.strictEqual(offer.aiGenerated, 0, 'aiGenerated flag must be 0 when using fallback');
    assert.ok(offer.messageText.includes('Hair Cut & Blow-Dry'));
    assert.ok(offer.messageText.endsWith(REQUIRED_CTA));

    memDb.close();
  });

  it('forces aiGenerated = 0 when caller passes custom messageText (prevents false claims)', async () => {
    const memDb = setupTestDb();

    const customText = 'Manual override message by receptionist. Reply YES to confirm or NO to pass.';
    const offer = await createOfferAsync('apt-001', 'wl-001', {
      messageText: customText,
      aiGenerated: 1, // Caller attempting to falsely claim AI generation
    }, memDb);

    assert.strictEqual(offer.aiGenerated, 0, 'aiGenerated flag must be forced to 0 on manual custom text');
    assert.strictEqual(offer.messageText, customText);

    memDb.close();
  });
});
