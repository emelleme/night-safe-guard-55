const twig = require("@factorial/eleventy-plugin-twig");
const Twig = require("twig");

const randomValue = (min = 0, max) => {
  if (Array.isArray(min)) {
    return min[Math.floor(Math.random() * min.length)];
  }

  if (max === undefined) {
    max = min;
    min = 0;
  }

  return Math.floor(Math.random() * (Number(max) - Number(min) + 1)) + Number(min);
};

Twig.extendFunction("random", randomValue);
Twig.extendFilter("random", randomValue);

const twigOptions = {
  twig: {
    namespaces: {
      includes: 'src/_includes'
    },
  },
  images: {},
  dir: {
    input: "src",
    output: "dist",
    watch: "src/**/*.{css,js,twig}",
  },
};

module.exports = (config) => {
  // Copy images to match template references
  config.addPassthroughCopy({ 'src/assets/images': 'images' })
  config.addPassthroughCopy({ 'src/assets/swimweek': 'images/swimweek' })

  // Copy standalone game engines and assets
  config.addPassthroughCopy({ 'src/assets/games': 'game-assets' })

  // Copy root translation data for client-side fetches
  config.addPassthroughCopy({ 'public/translations.json': 'translations.json' })

  // Cloudflare Pages routing rules (gallery deep links)
  config.addPassthroughCopy({ 'src/_redirects': '_redirects' })
  
  // Copy models to assets directory
  config.addPassthroughCopy({ 'src/assets/models': 'models' })

  // Copy FaceAPI models from root
  config.addPassthroughCopy({ 'models': 'models' })
  
  // Copy Jo's images (fixed typo in 'images')
  config.addPassthroughCopy({ 'src/assets/images/jo': 'images/jo' })

  // Copy Jo's images (fixed typo in 'images')
  config.addPassthroughCopy({ 'src/assets/images/textures': 'images/textures' })

  // Copy DAOs PDF
  config.addPassthroughCopy({ 'src/assets/daos.pdf': 'daos.pdf' })

  // Copy ITOA application
  config.addPassthroughCopy({ 'src/itoalive': 'itoalive' })

  // Copy scripts directory
  config.addPassthroughCopy({ 'src/_scripts': '_scripts' })

  // Copy swap test page
  config.addPassthroughCopy({ 'src/swap-test.html': 'swap-test.html' })

  config.addPlugin(twig, twigOptions)
  
  config.setBrowserSyncConfig({
    files: ['dist/**/*'],
    open: true,
    server: {
      baseDir: 'dist',
      serveStaticOptions: {
        extensions: ['html', 'js', 'css', 'pdf'],
        setHeaders: function(res, path) {
          if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
          }
          if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
          }
          if (path.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
          }
        }
      },
      middleware: [
        function(req, res, next) {
          // Redirect currentseas.xyz to the new landing page
          if (req.headers.host === 'currentseas.xyz' && req.url === '/') {
            res.writeHead(302, { 'Location': '/index-xyz.html' });
            res.end();
            return;
          }
          
          // Handle viewer aliases by redirecting to the rendered /viewer/ route
          if (req.url.startsWith('/view?')) {
            res.writeHead(302, { 'Location': '/viewer/' + req.url.substring(5) });
            res.end();
            return;
          }

          if (req.url === '/viewer' || req.url.startsWith('/viewer?')) {
            const query = req.url === '/viewer' ? '' : req.url.substring('/viewer'.length);
            res.writeHead(302, { 'Location': '/viewer/' + query });
            res.end();
            return;
          }
          
          next();
        }
      ]
    }
  })

  // Add watch targets for assets
  config.addWatchTarget("src/assets/**/*")
  config.addWatchTarget("src/itoalive/**/*")

  // Gift system routes
  config.addPassthroughCopy({ 'src/gift-create.twig': 'gifts/create/index.html' })
  
  // Dynamic gift claim pages
  config.addCollection('giftPages', function(collectionApi) {
    return [{
      data: {
        layout: 'layout.twig',
        permalink: data => `/gift/{{ giftId }}/`,
      },
      inputPath: './src/gift.twig',
      outputPath: 'gift/index.html'
    }];
  });

  // Add loveburn bonds collection
  config.addCollection('loveburnBonds', async function(collectionApi) {
    const bonds = await require('./src/_data/loveburnBonds')();
    return bonds.map(bond => ({
      ...bond,
      url: `/loveburn/${bond.id}`,
      template: 'loveburn/bond.twig'
    }));
  });

  // Configure pagination for bond pages
  config.addCollection('bondPages', function(collectionApi) {
    const bonds = collectionApi.getFilteredByTag('loveburnBonds');
    return bonds.map(bond => ({
      ...bond,
      pagination: {
        data: 'loveburnBonds',
        size: 1,
        alias: 'bond',
        addAllPagesToCollections: true
      },
      permalink: data => `/loveburn/${slugify(data.bond.title)}/`
    }));
  });

  // Add global site data
  config.addGlobalData("site", {
    url: "https://cseas.fun",
    name: "CurrentSeas",
    description: "CurrentSeas: Reality System for ocean conservation through art, XR, and tokens.",
    image: "/images/cseaspin.gif"
  });

  // Add slugify filter
  const slugify = require('slugify');
  config.addFilter('slug', (str) => slugify(str, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  }));

  return {
    dir: {
      input: 'src',
      output: 'dist',
    },
    markdownTemplateEngine: 'twig',
    templateFormats: ['twig', 'md', 'html'],
    passthroughFileCopy: true
  }
}
