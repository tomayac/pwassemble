/* global instance */
/* eslint "require-jsdoc": 0 */
function getFeed(url) {
  return fetch(`./feeds?url=${encodeURIComponent(url)}`)
  .then(response => {
    if (!response.ok) {
      return Response.error();
    }
    return response.text()
    // Rewrite non-http links and proxy them locally
    .then(raw => JSON.parse(raw.replace(/src=(\\["'])(http:\/\/.*?)(?:\\["'])/g,
        (_, p1, p2) => `src=${p1}./proxy?url=${encodeURIComponent(p2)}${p1}`)));
  })
  .catch(fetchError => {
    throw fetchError;
  });
}

function getHtml(entries) {
  // Helper function to proxy unsecure HTTP URLs over HTTPS
  const proxyHttps = url => /^http:\/\//.test(url) ?
      `./proxy?url=${encodeURIComponent(url)}` : url;

  return Promise.resolve(`
      ${entries.map(entry => {
        let videos = [];
        return `
            <article ${entry.meta.language ?
                `lang="${entry.meta.language}"` : ''}>
              <header>
                <a href="${entry.link}"><h2>${entry.title}</h2></a>
              </header>
              ${entry.enclosures.length ?
                  (entry.enclosures.map(enc => {
                    if (/^image/.test(enc.type)) {
                      return `<p><img alt="" src="${proxyHttps(enc.url)}"></p>`;
                    } else if (/^video/.test(enc.type)) {
                      videos.push(
                          `<source src="${proxyHttps(enc.url)}"></source>`);
                    }
                    return 0;
                  }).join('') + (videos.length ?
                      `<p><video controls>${videos.join('\n')}</video></p>` :
                      '')
                  ) :
                  ''}
              ${entry.image && entry.image.url ?
                  `<p><img alt="" src="${proxyHttps(entry.image.url)}"></p>` :
                  ''}
              ${entry.description ? // eslint-disable-line no-nested-ternary
                  `<section>${entry.description}</section>` :
                  (entry.summary ?
                      `<section>${entry.summary}</section>` :
                      '')}
              <footer>
                <p>Posted on
                  <time datetime="${new Date(entry.date).toISOString()}">
                    ${new Date(entry.date).toLocaleString()}
                  </time>
                  ${entry.author ? `by ${entry.author}` : ''}
                </p>
              </footer>
            </article>`;
      }).join('\n')}`);
}

getFeed(instance.rssFeed)
.then(entries => getHtml(entries))
.then(html => {
  document.querySelector('#container').querySelector('main').innerHTML = html;
})
.catch(error => {
  console.log(error);
});
