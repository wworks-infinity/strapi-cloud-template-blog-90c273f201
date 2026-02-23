'use strict';

/**
 * welcome-guide service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::welcome-guide.welcome-guide');
