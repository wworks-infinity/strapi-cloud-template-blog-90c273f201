'use strict';

/**
 *  article controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::article.article', ({ strapi }) => ({
  async findOne(ctx) {
    const { id } = ctx.params;

    const filters = /^\d+$/.test(id) ? { id } : { slug: id };

    const sanitizedQuery = await this.sanitizeQuery(ctx);

    const results = await strapi.entityService.findMany('api::article.article', {
      ...sanitizedQuery,
      filters,
      limit: 1,
    });

    const entity = Array.isArray(results) ? results[0] : results;

    if (!entity) {
      return ctx.notFound('Article not found');
    }

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));
