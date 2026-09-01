import Anthropic from '@anthropic-ai/sdk'
import { TOOLS, toolsByName } from './tools.js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
const MAX_TOOL_ITERATIONS = 5 // salvavidas: nunca deja que el modelo llame tools sin parar

const SYSTEM_PROMPT = `Eres el asistente interno de SALPER, un taller de uniformes y sublimación en Torreón, Coahuila. Respondes preguntas sobre las órdenes de producción del taller usando las herramientas disponibles — nunca inventes datos ni folios, siempre consulta primero. Responde en español, corto y directo, como hablaría alguien del taller (nada de párrafos largos ni formalidad excesiva). Si la pregunta no tiene que ver con las órdenes de producción, dilo con claridad en vez de inventar una respuesta.`

const toolDefinitions = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }))

// Recibe el mensaje nuevo + el historial en texto plano (lo que ya se
// mostró en pantalla, sin los pasos intermedios de tool use de mensajes
// anteriores) y corre el ciclo de tool use hasta que el modelo responda
// con texto final. Cada pregunta arranca su propio ciclo de tools "de
// cero" — no se arrastran llamadas de tools de turnos anteriores, así
// el contrato con el frontend se queda simple (solo texto).
export async function runChat({ message, history }) {
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content.find((b) => b.type === 'text')?.text?.trim()
      return text || 'No tengo una respuesta para eso.'
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const tool = toolsByName[block.name]
      let resultPayload
      try {
        resultPayload = tool
          ? await tool.handler(block.input || {})
          : { error: `Herramienta desconocida: ${block.name}` }
      } catch (err) {
        resultPayload = { error: err.message || 'Error al ejecutar la herramienta.' }
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(resultPayload),
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return 'No pude terminar de procesar tu pregunta — intenta reformularla o hacerla más específica.'
}
