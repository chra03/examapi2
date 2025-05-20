import 'dotenv/config'
import Fastify from 'fastify'
import { submitForReview } from './submission.js'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

const fastify = Fastify({ logger: true })

// Base de données en mémoire
const recipesByCity = {}
let nextRecipeId = 1

// Route GET /cities/:cityId/infos
fastify.get('/cities/:cityId/infos', {
  schema: {
    description: 'Retourne les informations d\'une ville',
    tags: ['Cities'],
    params: {
      type: 'object',
      properties: {
        cityId: { type: 'string' }
      },
      required: ['cityId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          population: { type: 'integer' },
          knownFor: {
            type: 'array',
            items: { type: 'string' }
          },
          weatherPredictions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                when: { type: 'string' },
                min: { type: 'number' },
                max: { type: 'number' }
              },
              required: ['when', 'min', 'max']
            }
          },
          recipes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                content: { type: 'string' }
              },
              required: ['id', 'content']
            }
          }
        },
        required: ['coordinates', 'population', 'knownFor', 'weatherPredictions', 'recipes']
      }
    }
  }
}, async (request, reply) => {
  const { cityId } = request.params
  const apiKey = process.env.API_KEY

  try {
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`)
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' })
    }
    const cityData = await cityRes.json()

    const coord = cityData.coordinates[0]
    const coordinates = [coord.latitude, coord.longitude]
    const population = cityData.population
    const knownFor = cityData.knownFor.map(k => k.content)

    const weatherRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/weather-predictions?cityIdentifier=${cityId}&apiKey=${apiKey}`)
    const weatherData = await weatherRes.json()
    const predictions = weatherData[0]?.predictions || []

    const weatherPredictions = [
      {
        when: 'today',
        min: predictions[0]?.minTemperature ?? 0,
        max: predictions[0]?.maxTemperature ?? 0
      },
      {
        when: 'tomorrow',
        min: predictions[1]?.minTemperature ?? 0,
        max: predictions[1]?.maxTemperature ?? 0
      }
    ]

    const recipes = recipesByCity[cityId] || []

    return {
      coordinates,
      population,
      knownFor,
      weatherPredictions,
      recipes
    }
  } catch (error) {
    console.error(error)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// Route POST /cities/:cityId/recipes
fastify.post('/cities/:cityId/recipes', async (request, reply) => {
  const { cityId } = request.params
  const { content } = request.body
  const apiKey = process.env.API_KEY

  try {
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`)
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' })
    }

    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Content is required' })
    }
    if (content.length < 10) {
      return reply.code(400).send({ error: 'Content too short (min 10 characters)' })
    }
    if (content.length > 2000) {
      return reply.code(400).send({ error: 'Content too long (max 2000 characters)' })
    }

    const newRecipe = {
      id: nextRecipeId++,
      content: content
    }

    if (!recipesByCity[cityId]) {
      recipesByCity[cityId] = []
    }

    recipesByCity[cityId].push(newRecipe)

    return reply.code(201).send(newRecipe)
  } catch (error) {
    console.error(error)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// Route DELETE /cities/:cityId/recipes/:recipeId
fastify.delete('/cities/:cityId/recipes/:recipeId', async (request, reply) => {
  const { cityId, recipeId } = request.params
  const apiKey = process.env.API_KEY

  try {
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`)
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' })
    }

    const recipes = recipesByCity[cityId]
    if (!recipes) {
      return reply.code(404).send({ error: 'No recipes for this city' })
    }

    const index = recipes.findIndex(r => r.id === parseInt(recipeId))
    if (index === -1) {
      return reply.code(404).send({ error: 'Recipe not found' })
    }

    recipes.splice(index, 1)
    return reply.code(204).send()
  } catch (error) {
    console.error(error)
    return reply.code(500).send({ error: 'Internal Server Error' })
  }
})

// Swagger JSON
await fastify.register(swagger, {
  exposeRoute: true,
  routePrefix: '/json',
  openapi: {
    info: {
      title: 'API MIASHS 2025',
      description: 'Documentation API villes + recettes',
      version: '1.0.0'
    }
  }
})

// Swagger UI sur "/"
await fastify.register(swaggerUI, {
  routePrefix: '/',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  },
  staticCSP: true,
  transformSpecificationClone: true
})

fastify.listen(
  {
    port: process.env.PORT || 3000,
    host: process.env.RENDER_EXTERNAL_URL ? '0.0.0.0' : process.env.HOST || 'localhost',
  },
  function (err) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
    submitForReview(fastify)
  }
)
