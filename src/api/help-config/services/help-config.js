'use strict';

/**
 * help-config service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::help-config.help-config');
