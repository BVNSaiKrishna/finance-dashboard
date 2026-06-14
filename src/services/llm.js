/**
 * Decoupled LLM Service for Google Gemini and OpenAI GPT REST API calls.
 */

// Helper to deep clone objects
const clone = (obj) => JSON.parse(JSON.stringify(obj));

// Standardize Google Gemini types to UPPERCASE
function convertTypesToGemini(schema) {
  if (!schema) return schema;
  const newSchema = clone(schema);
  
  if (newSchema.type) {
    newSchema.type = newSchema.type.toUpperCase();
  }
  if (newSchema.properties) {
    for (const key of Object.keys(newSchema.properties)) {
      newSchema.properties[key] = convertTypesToGemini(newSchema.properties[key]);
    }
  }
  if (newSchema.items) {
    newSchema.items = convertTypesToGemini(newSchema.items);
  }
  return newSchema;
}

/**
 * Executes a chat completions / content generation request to Gemini or OpenAI.
 * 
 * @param {Object} params
 * @param {string} params.provider - "gemini" | "openai"
 * @param {string} params.apiKey - The API key configured in localStorage
 * @param {Array} params.messages - Conversational history
 * @param {Array} params.tools - Declarations of tool functions
 * @param {string} params.systemInstruction - The system persona instruction
 * @returns {Promise<Object>} The standardized response object
 */
export async function callLLM({ provider, apiKey, messages, tools = [], systemInstruction = "" }) {
  if (!apiKey) {
    throw new Error("API Key is missing. Please configure it in Settings.");
  }

  if (provider === "gemini") {
    // ── GOOGLE GEMINI API INTEGRATION ──
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Format tools for Gemini API
    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: convertTypesToGemini(t.parameters)
      }))
    }] : undefined;

    // Convert message history to Gemini contents structure
    const contents = messages.map(msg => {
      if (msg.role === "system") return null; // System instructions are passed separately
      
      const parts = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      
      // Handle tool call history
      if (msg.toolCalls) {
        msg.toolCalls.forEach(tc => {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.args
            }
          });
        });
      }
      
      // Handle tool responses
      if (msg.role === "tool" || msg.role === "function") {
        return {
          role: "function",
          parts: [{
            functionResponse: {
              name: msg.name,
              response: { result: msg.content }
            }
          }]
        };
      }

      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts
      };
    }).filter(Boolean);

    const payload = {
      contents,
      tools: geminiTools
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!candidate || !part) {
      throw new Error("Received empty response from Gemini API.");
    }

    // Check for tool calls
    const toolCallParts = candidate.content.parts.filter(p => p.functionCall);
    if (toolCallParts.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: toolCallParts.map(p => ({
          id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: p.functionCall.name,
          args: p.functionCall.args || {}
        }))
      };
    }

    return {
      type: "text",
      text: part.text || ""
    };

  } else if (provider === "openai") {
    // ── OPENAI GPT-4O-MINI API INTEGRATION ──
    const endpoint = "https://api.openai.com/v1/chat/completions";

    // Format tools for OpenAI API
    const openaiTools = tools.length > 0 ? tools.map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    })) : undefined;

    // Convert messages to OpenAI structure
    const openaiMessages = [];
    if (systemInstruction) {
      openaiMessages.push({ role: "system", content: systemInstruction });
    }

    messages.forEach(msg => {
      // Map tool call logs
      if (msg.toolCalls) {
        openaiMessages.push({
          role: "assistant",
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id || "call_default",
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args)
            }
          }))
        });
        return;
      }

      // Map tool execution results
      if (msg.role === "tool" || msg.role === "function") {
        openaiMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId || "call_default",
          name: msg.name,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        });
        return;
      }

      openaiMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      });
    });

    const payload = {
      model: "gpt-4o-mini",
      messages: openaiMessages,
      tools: openaiTools
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) {
      throw new Error("Received empty response from OpenAI API.");
    }

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: message.tool_calls.map(tc => {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch (e) {
            console.error("Failed to parse OpenAI arguments", e);
          }
          return {
            id: tc.id,
            name: tc.function.name,
            args
          };
        })
      };
    }

    return {
      type: "text",
      text: message.content || ""
    };
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
