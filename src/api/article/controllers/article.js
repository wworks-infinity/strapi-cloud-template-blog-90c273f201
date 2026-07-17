'use strict';

/**
 *  article controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

const DOCUMENT_ID_PATTERN = /^[a-z0-9]{20,}$/i;

module.exports = createCoreController('api::article.article', ({ strapi }) => ({
  async findOne(ctx) {
    const { id } = ctx.params;
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    let entity;

    if (DOCUMENT_ID_PATTERN.test(id)) {
      entity = await strapi.documents('api::article.article').findOne({
        documentId: id,
        ...sanitizedQuery,
      });
    }

    if (!entity) {
      const results = await strapi.documents('api::article.article').findMany({
        ...sanitizedQuery,
        filters: { ...(sanitizedQuery.filters || {}), slug: id },
        limit: 1,
      });
      entity = Array.isArray(results) ? results[0] : results;
    }

    if (!entity) {
      return ctx.notFound('Article not found');
    }

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));
