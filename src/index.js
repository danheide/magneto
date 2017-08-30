var request = require('request');
var _ = require('underscore');
var magnetUri = require('magnet-uri');
var cheerio = require('cheerio');
var clipboard = nw.Clipboard.get();
var validUrl = require('valid-url');

// Initialize Framework7 UI
var myApp = new Framework7();
var $$ = Dom7;

// Load main view
var mainView = myApp.addView('.view-main', {
    dynamicNavbar: true
});

// Search click handler
$$('.form-to-data').on('click', function () {
    // Fetch user search query
    var formData = myApp.formToData('#my-form');
    var searchQuery = formData.search;

    // Go to results page
    mainView.router.loadContent($$('#results').html());

    // check if we already have fetched a list of tpb proxies
    Mgt.search(searchQuery);
});

// App namespace
var Mgt = {};

// Load local cache of sources
Mgt.sources = require('./sources.json');
console.info('Loaded local list of sources', Mgt.sources);

// Dynamic source aggregation methods
Mgt.sourceAggregator = {};
Mgt.sourceAggregator.tpb = function () {
    var tpbProxiesUrl = 'https://proxybay.github.io/';

    console.info('Retrieving fresh TPB sources...');
    request(tpbProxiesUrl, function (error, response, body) {
        if (error) {
            console.error(tpbProxiesUrl + ' seems to be down.');
            return;
        }

        var freshTpbProxies = [];
        var $ = cheerio.load(body);
        $('table[id="searchResult"]').find('tr').each(function (i, el) {
            var tr = $(el);
            if (tr.find('td.status > img').attr('alt') === 'up') {
                var freshProxyUrl = tr.find('td.site > a[href^="http"]').attr('href');
                if (
                    typeof freshProxyUrl === 'string'
                    && freshProxyUrl.length
                    && validUrl.isWebUri(freshProxyUrl)
                ) {
                    freshTpbProxies.push({
                        "url": freshProxyUrl,
                        "type": "tpb"
                    });
                }
            }
        });

        console.info('List of fresh TPB proxies: ', freshTpbProxies);

        // Merge fresh proxies with already loaded ones (remove duplicated proxies by url property)
        if (freshTpbProxies.length > 0) {
            console.info('Adding ' + freshTpbProxies.length + ' fresh TPB proxies to sources list');
            Mgt.sources = _.uniq(_.union(Mgt.sources, freshTpbProxies), false, function (proxy) {
                return proxy.url;
            });
        }
    });
};
Mgt.sourceAggregator.init = function () {
    console.info('Initializing dynamic sources aggregators');
    Mgt.sourceAggregator.tpb();
    // todo: add more dynamic aggregators
};
Mgt.sourceAggregator.init();

// Loading utils
Mgt.preloader = {};
Mgt.preloader.log = function (txt) {
    var logTarget = $$('.preloading-log');
    logTarget.children().each(function (i, el) {
        var logEl = $$(el);
        if (!logEl.hasClass('fadeOut')) {
            logEl.addClass('animated fadeOut');
        }
    });
    logTarget.prepend('<div>' + txt + '</div>');
};
Mgt.preloader.fatal = function (txt) {
    $$('.preloading-block').hide();
    $$('.content-block.results').append($$(
        '<p>Magnets not found: ' + txt + '</p>' +
        '<p><a href="#" class="back">Back to Search</a></p>'
    ));
};
Mgt.preloader.isDone = false;
Mgt.preloader.done = function () {
    $$('.preloading-block').hide();
    $$('.content-block.results')
        .append($$('#results-table').html())
        .on('click', 'a.magnet', function () {
            clipboard.set($$(this).data('magnet'), 'text');
            myApp.alert('Magnet link for "' + $$(this).data('name') + '" copied to your system clipboard', 'Great success!');
        })
        .on('click', 'th.sortable-cell', function () {
            // Switch active class
            var th = $$(this);
            th.siblings().removeClass('sortable-active');
            th.addClass('sortable-active');
            // Sort
            var column = th.data('column');
            Mgt.results.sort(column);
        });
};

// Results handlers
Mgt.results = {};
Mgt.results.added = [];
Mgt.results.add = function (magnet, name, uploaded, size, uploadedBy, seeders, leechers) {
    // Validate magnet before adding
    if (typeof magnet !== 'string' || !magnet.length) {
        return;
    }

    try {
        var parsedMagnet = magnetUri.decode(magnet);
    } catch (err) {
        console.warn('Error while trying to decode magnet link information:' + magnet);
        return;
    }

    if (typeof parsedMagnet === 'undefined' || typeof parsedMagnet.xt !== 'string' || !parsedMagnet.xt.length) {
        return;
    }

    // Ensure this magnet has not been already added to the results list
    if (_.contains(Mgt.results.added, parsedMagnet.xt)) {
        return;
    }

    // Finish preloading process
    if (!Mgt.preloader.isDone) {
        Mgt.preloader.done();
        Mgt.preloader.isDone = true;
    }

    // Store magnet xt as added result
    Mgt.results.added.push(magnet.xt);

    $$('.content-block-inner.results')
        .find('tbody')
        .append($$(
            '<tr>' +
            '    <td>' +
            '        <a class="magnet" href="#" data-magnet="' + magnet + '" data-name="' + name + '">' +
            '            <i class="fa fa-magnet"></i>' +
            '        </a>' +
            '    </td>' +
            '    <td class="label-cell">' + name + '</td>' +
            '    <td>' + uploaded + '</td>' +
            '    <td>' + size + '</td>' +
            '    <td>' + uploadedBy + '</td>' +
            '    <td class="numeric-cell">' + seeders + '</td>' +
            '    <td class="numeric-cell">' + leechers + '</td>' +
            '</tr>'
        ));

    // todo: trigger table sort?
};
Mgt.results.sort = function (columnNumber) {
    var table, rows, switching, i, x, y, shouldSwitch, dir, switchCount = 0;
    table = $$("#results-table");
    switching = true;
    dir = "asc";
    while (switching) {
        switching = false;
        rows = table.find("tr");
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].find("td")[columnNumber];
            y = rows[i + 1].find("td")[columnNumber];
            if (dir === "asc") {
                if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
                    shouldSwitch= true;
                    break;
                }
            } else if (dir === "desc") {
                if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
                    shouldSwitch= true;
                    break;
                }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchCount ++;
        } else {
            if (switchCount === 0 && dir === "asc") {
                dir = "desc";
                switching = true;
            }
        }
    }
};

// Scraper
Mgt.Scraper = function (type) {
    this.scrape = function () {
        switch (type) {
            case 'tpb':
                return Mgt.scrapeStrategies.tpb;
        }
    }();
};
Mgt.Scraper.prototype.scrapeMagnets = function (url, searchQuery) {
    this.scrape(url, searchQuery);
};

// Scraping strategies
Mgt.scrapeStrategies = {};
Mgt.scrapeStrategies.tpb = function (url, searchQuery) {
    return request(url + '/search/' + encodeURI(searchQuery) + '/0/99/0', function (error, response, body) {
        if (error) {
            console.warn('Source ' + url + 'returned an error response (' + error + ')');
            return;
        }

        console.info('Source ' + url + ' responded. Validating response...');
        var $ = cheerio.load(body);
        var resultsTrList = $('#searchResult').find('tbody > tr');
        if (!resultsTrList.length) {
            console.warn('Response from ' + url + ' seems to not be valid. Ignoring response.');
            return;
        }

        console.info('Response from ' + url + ' validated. Loading results...');

        resultsTrList.each(function (i, el) {
            var tr = $(el);
            var magnet = tr.find('a[href^="magnet"]').attr('href');
            var name = tr.find('.detName > a').text();
            var uploadedBy = tr.find('a.detDesc').text();
            var description = tr.find('font.detDesc').clone().children().remove().end().text().split(',');
            var uploaded = description[0].replace('Uploaded ', '');
            var size = description[1].replace('Size ', '');
            var seeders = tr.find('td:nth-last-child(2)').text();
            var leechers = tr.find('td:last-child').text();

            Mgt.results.add(magnet, name, uploaded, size, uploadedBy, seeders, leechers);
        });
    });
};

// Search
Mgt.search = function (searchQuery) {
    // Reset preloading
    Mgt.preloader.isDone = false;
    Mgt.results.added = [];

    Mgt.preloader.log('Searching magnets...');
    for (var i = 0; i < Mgt.sources.length; i++) {
        new Mgt.Scraper(Mgt.sources[i].type).scrapeMagnets(Mgt.sources[i].url, searchQuery);
    }
};
