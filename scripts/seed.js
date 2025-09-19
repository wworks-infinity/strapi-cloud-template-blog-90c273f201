'use strict';

const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const { categories, authors, articles, global, about, knowledgeBase } = require('../data/data.json');

async function seedExampleApp() {
  const shouldImportSeedData = await isFirstRun();

  if (shouldImportSeedData) {
    try {
      console.log('Setting up the template...');
      await importSeedData();
      console.log('Ready to go');
    } catch (error) {
      console.log('Could not import seed data');
      console.error(error);
    }
  } else {
    console.log(
      'Seed data has already been imported. We cannot reimport unless you clear your database first.'
    );
  }
}

async function isFirstRun() {
  const pluginStore = strapi.store({
    environment: strapi.config.environment,
    type: 'type',
    name: 'setup',
  });
  const initHasRun = await pluginStore.get({ key: 'initHasRun' });
  await pluginStore.set({ key: 'initHasRun', value: true });
  return !initHasRun;
}

async function setPublicPermissions(newPermissions) {
  // Find the ID of the public role
  const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: {
      type: 'public',
    },
  });

  // Create the new permissions and link them to the public role
  const allPermissionsToCreate = [];
  Object.keys(newPermissions).map((controller) => {
    const actions = newPermissions[controller];
    const permissionsToCreate = actions.map((action) => {
      return strapi.query('plugin::users-permissions.permission').create({
        data: {
          action: `api::${controller}.${controller}.${action}`,
          role: publicRole.id,
        },
      });
    });
    allPermissionsToCreate.push(...permissionsToCreate);
  });
  await Promise.all(allPermissionsToCreate);
}

function getFileSizeInBytes(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeInBytes = stats['size'];
  return fileSizeInBytes;
}

function getFileData(fileName) {
  const filePath = path.join('data', 'uploads', fileName);
  // Parse the file metadata
  const size = getFileSizeInBytes(filePath);
  const ext = fileName.split('.').pop();
  const mimeType = mime.lookup(ext || '') || '';

  return {
    filepath: filePath,
    originalFileName: fileName,
    size,
    mimetype: mimeType,
  };
}

async function uploadFile(file, name) {
  return strapi
    .plugin('upload')
    .service('upload')
    .upload({
      files: file,
      data: {
        fileInfo: {
          alternativeText: `An image uploaded to Strapi called ${name}`,
          caption: name,
          name,
        },
      },
    });
}

// Create an entry and attach files if there are any
async function createEntry({ model, entry }) {
  try {
    // Actually create the entry in Strapi
    return await strapi.documents(`api::${model}.${model}`).create({
      data: entry,
    });
  } catch (error) {
    console.error({ model, entry, error });
  }
}

function getEntryDocumentId(entry) {
  if (!entry) {
    return null;
  }

  return entry.documentId || entry.id || null;
}

async function connectRelation({ model, documentId, attribute, entries }) {
  if (!documentId) {
    return;
  }

  const relations = entries
    .map((entry) => {
      if (entry?.documentId) {
        return { documentId: entry.documentId };
      }

      if (entry?.id) {
        return { id: entry.id };
      }

      return null;
    })
    .filter((identifier) => identifier !== null);

  if (!relations.length) {
    return;
  }

  await strapi.documents(`api::${model}.${model}`).update({
    documentId,
    data: {
      [attribute]: {
        connect: relations,
      },
    },
  });
}

async function checkFileExistsBeforeUpload(files) {
  const existingFiles = [];
  const uploadedFiles = [];
  const filesCopy = [...files];

  for (const fileName of filesCopy) {
    // Check if the file already exists in Strapi
    const fileWhereName = await strapi.query('plugin::upload.file').findOne({
      where: {
        name: fileName.replace(/\..*$/, ''),
      },
    });

    if (fileWhereName) {
      // File exists, don't upload it
      existingFiles.push(fileWhereName);
    } else {
      // File doesn't exist, upload it
      const fileData = getFileData(fileName);
      const fileNameNoExtension = fileName.split('.').shift();
      const [file] = await uploadFile(fileData, fileNameNoExtension);
      uploadedFiles.push(file);
    }
  }
  const allFiles = [...existingFiles, ...uploadedFiles];
  // If only one file then return only that file
  return allFiles.length === 1 ? allFiles[0] : allFiles;
}

async function updateBlocks(blocks) {
  const updatedBlocks = [];
  for (const block of blocks) {
    if (block.__component === 'shared.media') {
      const uploadedFiles = await checkFileExistsBeforeUpload([block.file]);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file name on the block with the actual file
      blockCopy.file = uploadedFiles;
      updatedBlocks.push(blockCopy);
    } else if (block.__component === 'shared.slider') {
      // Get files already uploaded to Strapi or upload new files
      const existingAndUploadedFiles = await checkFileExistsBeforeUpload(block.files);
      // Copy the block to not mutate directly
      const blockCopy = { ...block };
      // Replace the file names on the block with the actual files
      blockCopy.files = existingAndUploadedFiles;
      // Push the updated block
      updatedBlocks.push(blockCopy);
    } else {
      // Just push the block as is
      updatedBlocks.push(block);
    }
  }

  return updatedBlocks;
}

async function importArticles() {
  for (const article of articles) {
    const cover = await checkFileExistsBeforeUpload([`${article.slug}.jpg`]);
    const updatedBlocks = await updateBlocks(article.blocks);

    await createEntry({
      model: 'article',
      entry: {
        ...article,
        cover,
        blocks: updatedBlocks,
        // Make sure it's not a draft
        publishedAt: Date.now(),
      },
    });
  }
}

async function importGlobal() {
  const favicon = await checkFileExistsBeforeUpload(['favicon.png']);
  const shareImage = await checkFileExistsBeforeUpload(['default-image.png']);
  return createEntry({
    model: 'global',
    entry: {
      ...global,
      favicon,
      // Make sure it's not a draft
      publishedAt: Date.now(),
      defaultSeo: {
        ...global.defaultSeo,
        shareImage,
      },
    },
  });
}

async function importAbout() {
  const updatedBlocks = await updateBlocks(about.blocks);

  await createEntry({
    model: 'about',
    entry: {
      ...about,
      blocks: updatedBlocks,
      // Make sure it's not a draft
      publishedAt: Date.now(),
    },
  });
}

async function importCategories() {
  for (const category of categories) {
    await createEntry({ model: 'category', entry: category });
  }
}

async function importAuthors() {
  for (const author of authors) {
    const avatar = await checkFileExistsBeforeUpload([author.avatar]);

    await createEntry({
      model: 'author',
      entry: {
        ...author,
        avatar,
      },
    });
  }
}

async function importKnowledgeBaseGlobals() {
  if (!knowledgeBase?.global) {
    return;
  }

  await createEntry({
    model: 'knowledge-base-global',
    entry: {
      ...knowledgeBase.global,
      publishedAt: Date.now(),
    },
  });
}

async function importKnowledgeBaseAudiences() {
  const audienceMap = new Map();

  if (!knowledgeBase?.audiences) {
    return audienceMap;
  }

  for (const audience of knowledgeBase.audiences) {
    const createdAudience = await createEntry({
      model: 'knowledge-base-audience',
      entry: {
        ...audience,
        publishedAt: Date.now(),
      },
    });

    if (createdAudience) {
      audienceMap.set(createdAudience.slug || audience.slug, createdAudience);
    }
  }

  return audienceMap;
}

async function importKnowledgeBaseCollections(audienceMap) {
  const collectionMap = new Map();

  if (!knowledgeBase?.collections) {
    return collectionMap;
  }

  for (const collection of knowledgeBase.collections) {
    const { audienceSlugs = [], ...collectionData } = collection;

    const createdCollection = await createEntry({
      model: 'knowledge-base-collection',
      entry: {
        ...collectionData,
        publishedAt: Date.now(),
      },
    });

    if (createdCollection) {
      const audiencesToConnect = audienceSlugs
        .map((slug) => audienceMap.get(slug))
        .filter(Boolean);

      await connectRelation({
        model: 'knowledge-base-collection',
        documentId: getEntryDocumentId(createdCollection),
        attribute: 'audiences',
        entries: audiencesToConnect,
      });

      collectionMap.set(createdCollection.slug || collection.slug, createdCollection);
    }
  }

  return collectionMap;
}

async function importKnowledgeBaseArticles(audienceMap, collectionMap) {
  const articleMap = new Map();

  if (!knowledgeBase?.articles) {
    return articleMap;
  }

  for (const article of knowledgeBase.articles) {
    const { audienceSlugs = [], collectionSlugs = [], ...articleData } = article;

    const createdArticle = await createEntry({
      model: 'knowledge-base-article',
      entry: {
        ...articleData,
        publishedAt: Date.now(),
      },
    });

    if (createdArticle) {
      const audiencesToConnect = audienceSlugs
        .map((slug) => audienceMap.get(slug))
        .filter(Boolean);
      const collectionsToConnect = collectionSlugs
        .map((slug) => collectionMap.get(slug))
        .filter(Boolean);

      const documentId = getEntryDocumentId(createdArticle);

      await connectRelation({
        model: 'knowledge-base-article',
        documentId,
        attribute: 'audiences',
        entries: audiencesToConnect,
      });

      await connectRelation({
        model: 'knowledge-base-article',
        documentId,
        attribute: 'collections',
        entries: collectionsToConnect,
      });

      articleMap.set(createdArticle.slug || article.slug, createdArticle);
    }
  }

  return articleMap;
}

async function importKnowledgeBaseReleaseNotes(audienceMap, articleMap) {
  if (!knowledgeBase?.releaseNotes) {
    return;
  }

  for (const releaseNote of knowledgeBase.releaseNotes) {
    const { audienceSlugs = [], articleSlugs = [], ...releaseNoteData } = releaseNote;

    const createdReleaseNote = await createEntry({
      model: 'knowledge-base-release-note',
      entry: {
        ...releaseNoteData,
        publishedAt: Date.now(),
      },
    });

    if (!createdReleaseNote) {
      continue;
    }

    const audiencesToConnect = audienceSlugs
      .map((slug) => audienceMap.get(slug))
      .filter(Boolean);
    const articlesToConnect = articleSlugs
      .map((slug) => articleMap.get(slug))
      .filter(Boolean);

    const documentId = getEntryDocumentId(createdReleaseNote);

    await connectRelation({
      model: 'knowledge-base-release-note',
      documentId,
      attribute: 'audiences',
      entries: audiencesToConnect,
    });

    await connectRelation({
      model: 'knowledge-base-release-note',
      documentId,
      attribute: 'articles',
      entries: articlesToConnect,
    });
  }
}

async function importKnowledgeBase() {
  await importKnowledgeBaseGlobals();
  const audienceMap = await importKnowledgeBaseAudiences();
  const collectionMap = await importKnowledgeBaseCollections(audienceMap);
  const articleMap = await importKnowledgeBaseArticles(audienceMap, collectionMap);
  await importKnowledgeBaseReleaseNotes(audienceMap, articleMap);
}

async function importSeedData() {
  // Allow read of application content types
  await setPublicPermissions({
    article: ['find', 'findOne'],
    category: ['find', 'findOne'],
    author: ['find', 'findOne'],
    global: ['find', 'findOne'],
    about: ['find', 'findOne'],
    'knowledge-base-global': ['find', 'findOne'],
    'knowledge-base-audience': ['find', 'findOne'],
    'knowledge-base-collection': ['find', 'findOne'],
    'knowledge-base-article': ['find', 'findOne'],
    'knowledge-base-release-note': ['find', 'findOne'],
  });

  // Create all entries
  await importCategories();
  await importAuthors();
  await importArticles();
  await importGlobal();
  await importAbout();
  await importKnowledgeBase();
}

async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = 'error';

  await seedExampleApp();
  await app.destroy();

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
