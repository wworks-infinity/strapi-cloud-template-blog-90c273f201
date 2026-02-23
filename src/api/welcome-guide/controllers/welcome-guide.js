'use strict';

/**
 * welcome-guide controller.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::welcome-guide.welcome-guide', ({ strapi }) => ({
  async findBySlug(ctx) {
    const { slug } = ctx.params;

    if (!slug) {
      return ctx.badRequest('Slug is required');
    }

    const entity = await strapi.db
      .query('api::welcome-guide.welcome-guide')
      .findOne({
        where: { slug },
        populate: {
          sections: true,
          resources: true,
        },
      });

    if (!entity) {
      return ctx.notFound('Welcome Guide not found');
    }

    return this.transformResponse(entity);
  },
}));
