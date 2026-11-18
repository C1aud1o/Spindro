# Launch: getting found on search engines

What the owner has to do by hand. The site already has titles, descriptions, canonical links, `hreflang`, Open Graph cards, structured data, `sitemap.xml` (with `lastmod`) and `robots.txt` (the beta is disallowed). Nothing here costs money. Do not buy links, do not use paid ads, and do not stuff keywords.

The tags below are public: they only prove that you control the site. They contain no personal data.

## Google Search Console

1. Open <https://search.google.com/search-console> and sign in with the Google account that should own the site.
2. Add a property of type **URL prefix** with `https://spindro.fit/`.
3. Choose the verification method **HTML tag**. Google shows a line like `<meta name="google-site-verification" content="XXXX">`. Copy only the value of `content`.
4. Paste it into `site/config.json`, field `searchVerification.google`, and publish the site (merge to `main`, wait for the deploy).
5. Back in Search Console press **Verify**. Keep the tag in place: removing it un-verifies the site.
6. Open **Sitemaps**, enter `sitemap.xml` and submit. The status should become "Success" and list the pages found.
7. Optional: in **URL inspection** paste the address of a new guide and press **Request indexing**. Do this for a few pages, not for all of them.

## Bing Webmaster Tools

1. Open <https://www.bing.com/webmasters> and sign in.
2. Add the site `https://spindro.fit/` (or import it from Google Search Console, which skips the verification).
3. If you verify by hand, choose **HTML Meta Tag**. Bing shows `<meta name="msvalidate.01" content="XXXX">`. Copy the value of `content`.
4. Paste it into `site/config.json`, field `searchVerification.bing`, publish, and press **Verify**.
5. Open **Sitemaps** and submit `https://spindro.fit/sitemap.xml`.

## After that

- Indexing takes days to weeks. Judge it after a month, not after a day.
- Look at **Performance** (Google) and **Search Performance** (Bing) to see which searches bring people to which page. If a guide gets impressions but no clicks, rewrite its title and description in plain words; do not add keywords.
- If a page is reported as "Crawled, currently not indexed", wait. More pages linking to it help: link it from the other guides and from the home page.
- The site counts visits with GoatCounter, without cookies. Search Console and Bing Webmaster Tools do not change that.

## Keeping the pages honest

The guides are the first thing a stranger reads about Spindro. Whenever a device is really tested, change `site/data/compatibility.json` (status `reported` or `verified`) and update the matching guide in `site/blog/` in both languages. The trainers guide is generated from that file, so it follows automatically. Never write "verified" for hardware nobody has ridden.
