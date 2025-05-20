import 'dotenv/config'
import Fastify from 'fastify'
import { submitForReview } from './submission.js'

const fastify = Fastify({
  logger: true,
})


// Base de données en mémoire
const recipesByCity = {};
let nextRecipeId = 1;

// Route GET /cities/:cityId/infos
fastify.get('/cities/:cityId/infos', async (request, reply) => {
  const { cityId } = request.params;
  const apiKey = process.env.API_KEY;

  try {
    // 1. Récupérer les infos de la ville
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }
    const cityData = await cityRes.json();

    const coord = cityData.coordinates[0];
    const coordinates = [coord.latitude, coord.longitude];
    const population = cityData.population;
    const knownFor = cityData.knownFor.map(k => k.content);

    // 2. Récupérer la météo
    const weatherRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/weather-predictions?cityIdentifier=${cityId}&apiKey=${apiKey}`);
    const weatherData = await weatherRes.json();
    const predictions = weatherData[0]?.predictions || [];

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
    ];

    // 3. Récupérer les recettes
    const recipes = recipesByCity[cityId] || [];

    // 4. Envoyer la réponse
    return {
      coordinates,
      population,
      knownFor,
      weatherPredictions,
      recipes
    };
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

// Route POST /cities/:cityId/recipes
fastify.post('/cities/:cityId/recipes', async (request, reply) => {
  const { cityId } = request.params;
  const { content } = request.body;
  const apiKey = process.env.API_KEY;

  try {
    // 1. Vérifier si la ville existe
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    // 2. Vérifier le contenu
    if (!content || typeof content !== 'string') {
      return reply.code(400).send({ error: 'Content is required' });
    }

    if (content.length < 10) {
      return reply.code(400).send({ error: 'Content too short (min 10 characters)' });
    }

    if (content.length > 2000) {
      return reply.code(400).send({ error: 'Content too long (max 2000 characters)' });
    }

    // 3. Créer une nouvelle recette
    const newRecipe = {
      id: nextRecipeId++,
      content: content
    };

    if (!recipesByCity[cityId]) {
      recipesByCity[cityId] = [];
    }

    recipesByCity[cityId].push(newRecipe);

    // 4. Envoyer la réponse
    return reply.code(201).send(newRecipe);

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

// Route DELETE /cities/:cityId/recipes/:recipeId
fastify.delete('/cities/:cityId/recipes/:recipeId', async (request, reply) => {
  const { cityId, recipeId } = request.params;
  const apiKey = process.env.API_KEY;

  try {
    // 1. Vérifier si la ville existe
    const cityRes = await fetch(`https://api-ugi2pflmha-ew.a.run.app/cities/${cityId}/insights?apiKey=${apiKey}`);
    if (!cityRes.ok) {
      return reply.code(404).send({ error: 'City not found' });
    }

    // 2. Vérifier si la recette existe
    const recipes = recipesByCity[cityId];
    if (!recipes) {
      return reply.code(404).send({ error: 'No recipes for this city' });
    }

    const index = recipes.findIndex(r => r.id === parseInt(recipeId));
    if (index === -1) {
      return reply.code(404).send({ error: 'Recipe not found' });
    }

    // 3. Supprimer la recette
    recipes.splice(index, 1);

    // 4. Réponse vide avec 204
    return reply.code(204).send();

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

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

// Swagger UI (affiché à la racine "/")
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

    //////////////////////////////////////////////////////////////////////
    // Don't delete this line, it is used to submit your API for review //
    // everytime your start your server.                                //
    //////////////////////////////////////////////////////////////////////
    submitForReview(fastify)
  }
)
