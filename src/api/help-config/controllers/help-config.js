'use strict';

/**
 * help-config controller.
 */

const { createCoreController } = require('@strapi/strapi').factories;

const rankMatchType = (matchType) => {
  if (matchType === 'exact') return 3;
  if (matchType === 'prefix') return 2;
  return 1;
};

const isMatch = (config, route) => {
  if (!config || !route) return false;
  if (config.matchType === 'exact') return route === config.routePattern;
  if (config.matchType === 'prefix') return route.startsWith(config.routePattern);
  if (config.matchType === 'wildcard') {
    const base = (config.routePattern || '').replace(/\*+$/, '');
    if (!base) return false;
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return route === normalizedBase || route.startsWith(base);
  }
  return false;
};

module.exports = createCoreController('api::help-config.help-config', ({ strapi }) => ({
  async findByRoute(ctx) {
    const route = ctx.request?.query?.route;
    const search = ctx.request?.query?.search?.trim().toLowerCase();

    if ((!route || typeof route !== 'string') && !search) {
      return ctx.badRequest('Route or search query parameter is required');
    }

    const entities = await strapi.db.query('api::help-config.help-config').findMany({
      where: { isActive: true, publishedAt: { $notNull: true } },
      populate: {
        articles: {
          populate: {
            article: true,
          },
        },
      },
    });

    if (search) {
      const results = entities.filter((config) => {
        const titleMatch = config.title?.toLowerCase().includes(search);

        const routeMatch = config.routePattern?.toLowerCase().includes(search);

        const articleMatch = config.articles?.some((item) =>
          item.article?.title?.toLowerCase().includes(search)
        );

        return titleMatch || routeMatch || articleMatch;
      });

      // Merge every matched config's articles into one list so the search
      // response has the same shape as the route response (data.articles).
      const seen = new Set();
      /** @type {any[]} */
      const articles = [];
      for (const config of results) {
        for (const item of config.articles || []) {
          const key = item.article?.documentId || `link-${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          articles.push(item);
        }
      }

      return this.transformResponse({
        title: `Search results for "${search}"`,
        icon: 'help',
        articles,
      });
    }

    const matches = entities.filter((config) => isMatch(config, route));

    if (matches.length === 0) {
      return ctx.notFound('Help Config not found');
    }

    matches.sort((a, b) => {
      const rankDiff = rankMatchType(b.matchType) - rankMatchType(a.matchType);
      if (rankDiff !== 0) return rankDiff;
      return (b.order || 0) - (a.order || 0);
    });

    return this.transformResponse(matches[0]);
  },
}));