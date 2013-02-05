{
	"translatorID": "1b9ed730-69c7-40b0-8a06-517a89a3a278",
	"label": "Library Catalog (PICA)",
	"creator": "Sean Takats, Michael Berkowitz, Sylvain Machefert, Sebastian Karcher",
	"target": "^https?://[^/]+(?:/[^/]+)?//?DB=\\d",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 200,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "gcsb",
	"lastUpdated": "2013-02-05 14:11:16"
}

/*Works for many, but not all PICA versions. Tested with:
http://opc4.kb.nl/
http://catalogue.rug.nl/
http://www.sudoc.abes.fr/
http://gso.gbv.de
*/

function getSearchResults(doc) {
	return doc.evaluate(
		"//table[@summary='short title presentation']/tbody/tr//td[contains(@class, 'rec_title')]",
		doc, null, XPathResult.ANY_TYPE, null);
}

function detectWeb(doc, url) {
	var multxpath = "//span[@class='tab1']";
	if (elt = doc.evaluate(multxpath, doc, null, XPathResult.ANY_TYPE, null).iterateNext()) {
		var content = elt.textContent;
		if ((content == "Liste des résultats") || (content == "shortlist") || (content == 'Kurzliste') || content == 'titellijst') {
			if(!getSearchResults(doc).iterateNext()) return;	//no results. Does not seem to be necessary, but just in case.
			return "multiple";
		} else if ((content == "Notice détaillée") || (content == "title data") || (content == 'Titeldaten') || (content == 'full title') || (content == 'Titelanzeige' || (content == 'titelgegevens'))) {
			var xpathimage = "//span[@class='rec_mat_long']/img";
			if (elt = doc.evaluate(xpathimage, doc, null, XPathResult.ANY_TYPE, null).iterateNext()) {
				var type = elt.getAttribute('src');
				//Z.debug(type);
				if (type.indexOf('article.') > 0) {
					//book section and journal article have the same icon
					//we can check if there is an ISBN
					if(ZU.xpath(doc, '//tr/td[@class="rec_lable" and .//span[starts-with(text(), "ISBN")]]').length) {
						return 'bookSection';
					}
					return "journalArticle";
				} else if (type.indexOf('audiovisual.') > 0) {
					return "film";
				} else if (type.indexOf('book.') > 0) {
					return "book";
				} else if (type.indexOf('handwriting.') > 0) {
					return "manuscript";
				} else if (type.indexOf('sons.') > 0 || type.indexOf('sound.') > 0 || type.indexOf('score') > 0) {
					return "audioRecording";
				} else if (type.indexOf('thesis.') > 0) {
					return "thesis";
				} else if (type.indexOf('map.') > 0) {
					return "map";
				}
			}
			return "book";
		}
	}
}

function scrape(doc, url) {
	var zXpath = '//span[@class="Z3988"]';
	var eltCoins = doc.evaluate(zXpath, doc, null, XPathResult.ANY_TYPE, null).iterateNext();
	if (eltCoins) {
		var coins = eltCoins.getAttribute('title');

		var newItem = new Zotero.Item();
		//newItem.repository = "SUDOC"; // do not save repository
		Zotero.Utilities.parseContextObject(coins, newItem);

		/** we need to clean up the results a bit **/
		//pages should not contain any extra characters like p. or brackets (what about supplementary pages?)
		if(newItem.pages) newItem.pages = newItem.pages.replace(/[^\d-]+/g, '');
		
		
	} else var newItem = new Zotero.Item();


	newItem.itemType = detectWeb(doc, url);
	newItem.libraryCatalog = "Library Catalog - " + doc.location.host;
	// 	We need to correct some informations where COinS is wrong
	var rowXpath = '//tr[td[@class="rec_lable"]]';
	var tableRows = doc.evaluate(rowXpath, doc, null, XPathResult.ANY_TYPE, null);
	var tableRow, role;
	while (tableRow = tableRows.iterateNext()) {
		var field = doc.evaluate('./td[@class="rec_lable"]', tableRow, null, XPathResult.ANY_TYPE, null).iterateNext().textContent;
		var value = doc.evaluate('./td[@class="rec_title"]', tableRow, null, XPathResult.ANY_TYPE, null).iterateNext().textContent;
		field = ZU.trimInternal(ZU.superCleanString(field.trim()))
			.toLowerCase().replace(/\(s\)/g, '');

		//Z.debug(field + ": " + value)
		//french, english, german, and dutch interface
		switch (field) {
			case 'auteur':
			case 'author':
			case 'medewerker':
			case 'verfasser':
			case 'other persons':
			case 'sonst. personen':
				if (field == 'medewerker') role = "editor";
				else role = "author";
				// With COins, we only get one author - so we start afresh.
				newItem.creators = new Array();
				//sudoc has authors on separate lines and with different format - use this
				if (url.search(/sudoc\.(abes\.)?fr/) != -1) {

					var authors = ZU.xpath(tableRow, './td[2]/div');
					for (var i in authors) {
						var authorText = authors[i].textContent;
						var authorFields = authorText.match(/^\s*(.+?)\s*(?:\((.+?)\)\s*)?\.\s*([^\.]+)\s*$/);
						var authorFunction = '';
						if (authorFields) {
							authorFunction = authorFields[3];
							authorText = authorFields[1];
							var extra = authorFields[2];
						}
						if (authorFunction) {
							authorFunction = Zotero.Utilities.superCleanString(authorFunction);
						}
						var zoteroFunction = '';
						// TODO : Add other author types
						if (authorFunction == 'Traduction') {
							zoteroFunction = 'translator';
						} else if ((authorFunction.substr(0, 7) == 'Éditeur')) {
							zoteroFunction = 'editor';
						} else if ((newItem.itemType == "thesis") && (authorFunction != 'Auteur')) {
							zoteroFunction = "contributor";
						} else {
							zoteroFunction = 'author';
						}

						if (authorFunction == "Université de soutenance" || authorFunction == "Organisme de soutenance") {
							// If the author function is "université de soutenance"	it means that this author has to be in "university" field
							newItem.university = authorText;
							newItem.city = extra; //store for later
						} else {

							var author = authorText.replace(/[\*\(].+[\)\*]/, "");
							newItem.creators.push(Zotero.Utilities.cleanAuthor(author, zoteroFunction, true));
						}
					}

				} else {
					//all non SUDOC catalogs separate authors by semicolon
					var authors = value.split(/\s*;\s*/);
					for (var i in authors) {
						var author = authors[i].replace(/[\*\(].+[\)\*]/, "");
						var comma = author.indexOf(",") != -1;
						newItem.creators.push(Zotero.Utilities.cleanAuthor(author, role, comma));
					}
				}
				break;

			case 'dans':
			case 'in':
				//Looks like we can do better with titles than COinS
				//journal/book title are always first
				//Several different formts for ending a title
				// end with "/" http://gso.gbv.de/DB=2.1/PPNSET?PPN=732386977
				//              http://gso.gbv.de/DB=2.1/PPNSET?PPN=732443563
				// end with ". -" followed by publisher information http://gso.gbv.de/DB=2.1/PPNSET?PPN=729937798
				// end with ", ISSN" (maybe also ISBN?) http://www.sudoc.abes.fr/DB=2.1/SET=6/TTL=1/SHW?FRST=10
				newItem.publicationTitle = ZU.superCleanString(
					value.substring(0,value.search(/(?:\/|,\s*IS[SB]N\b|\.\s*-)/i)));
				//ISSN/ISBN are easyto find
				//http://gso.gbv.de/DB=2.1/PPNSET?PPN=732386977
				//http://gso.gbv.de/DB=2.1/PPNSET?PPN=732443563
				var issnRE = /\b(is[sb]n)\s+([-\d\sx]+)/i;	//this also matches ISBN
				var m = value.match(issnRE);
				if(m) {
					if(m[1].toUpperCase() == 'ISSN' && !newItem.ISSN) {
						newItem.ISSN = m[2].replace(/\s+/g,'');
					} else if(m[1].toUpperCase() == 'ISBN' && !newItem.ISBN) {
						newItem.ISBN = m[2].replace(/\s+/g,'');
					}
				}
				//publisher information can preceeded ISSN/ISBN
				// typically / ed. by ****. - city, country : publisher
				//http://gso.gbv.de/DB=2.1/PPNSET?PPN=732386977
				var n = value;
				if(m) {
					n = value.split(m[0])[0];
					//first editors
					var ed = n.split('/');	//editors only appear after /
					if(ed.length > 1) {
						n = n.substr(ed[0].length+1);	//trim off title
						ed = ed[1].split('-',1)[0];
						n = n.substr(ed.length+1);	//trim off editors
						if(ed.indexOf('ed. by') != -1) {	//not http://gso.gbv.de/DB=2.1/PPNSET?PPN=732443563
							ed = ed.replace(/^\s*ed\.\s*by\s*|[.\s]+$/g,'')
									.split(/\s*(?:,|and)\s*/);	//http://gso.gbv.de/DB=2.1/PPNSET?PPN=731519299
							for(var i=0, m=ed.length; i<m; i++) {
								newItem.creators.push(ZU.cleanAuthor(ed[i], 'editor', false));
							}
						}
					}
					var loc = n.split(':');
					if(loc.length == 2) {
						if(!newItem.publisher) newItem.publisher = loc[1].replace(/^\s+|[\s,]+$/,'');
						if(!newItem.place) newItem.place = loc[0].replace(/\s*\[.+?\]\s*/, '').trim();
					}

					//we can now drop everything up through the last ISSN/ISBN
					n = value.split(issnRE).pop();
				}
				//For the rest, we have trouble with some articles, like
				//http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=013979922
				//we'll only take the last set of year, volume, issue

				//There are also some other problems, like
				//"How to cook a russian goose / by Robert Cantwell" at http://opc4.kb.nl

				//page ranges are last
				//but they can be indicated by p. or page (or s?)
				//http://www.sudoc.abes.fr/DB=2.1/SET=6/TTL=1/SHW?FRST=10
				//http://opc4.kb.nl/DB=1/SET=2/TTL=1/SHW?FRST=7
				//we'll just assume there are always pages at the end and ignore the indicator
				n = n.split(',');
				var pages = n.pop().match(/\d+(?:\s*-\s*\d+)/);
				if(pages && !newItem.pages) {
					newItem.pages = pages[0];
				}
				n = n.join(',');	//there might be empty values that we're joining here
									//could filter them out, but IE <9 does not support Array.filter, so we won't bother
				//we're left possibly with some sort of formatted volume year issue string
				//it's very unlikely that we will have 4 digit volumes starting with 19 or 20, so we'll just grab the year first
				var dateRE = /\b(?:19|20)\d{2}\b/g;
				var date, lastDate;
				while(date = dateRE.exec(n)) {
					lastDate = date[0]
					n = n.replace(lastDate,'');	//get rid of year
				}
				if(lastDate) {
					if(!newItem.date) newItem.date = lastDate;
				} else {	//if there's no year, panic and stop trying
					break;
				}
				//volume comes before issue
				//but there can sometimes be other numeric stuff that we have
				//not filtered out yet, so we just take the last two numbers
				//e.g. http://gso.gbv.de/DB=2.1/PPNSET?PPN=732443563
				var issvolRE = /[\d\/]+/g;	//in French, issues can be 1/4 (e.g. http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=013979922)
				var num, vol, issue;
				while(num = issvolRE.exec(n)) {
					if(issue != undefined) {
						vol = issue;
						issue = num[0];
					} else if(vol != undefined) {
						issue = num[0];
					} else {
						vol = num[0];
					}
				}
				if(vol != undefined && !newItem.volume) {
					newItem.volume = vol;
				}
				if(issue != undefined && !newItem.issue) {
					newItem.issue = issue;
				}
				break;
			case 'serie':
			case 'collection':
			case 'series':
			case 'schriftenreihe':
			case 'reeks':
				// The series isn't in COinS
				var series = value;
				var m;
				var volRE = /;[^;]*?(\d+)\s*$/;
				if(m = series.match(volRE)) {
					if(ZU.fieldIsValidForType('seriesNumber', newItem.itemType)) { //e.g. http://gso.gbv.de/DB=2.1/PPNSET?PPN=729937798
						if(!newItem.seriesNumber) newItem.seriesNumber = m[1];
					} else {	//e.g. http://www.sudoc.fr/05625248X
						if(!newItem.volume) newItem.volume = m[1];
					}
					series = series.replace(volRE, '').trim();
				}
				newItem.seriesTitle = newItem.series = series;	//see http://forums.zotero.org/discussion/18322/series-vs-series-title/
				break;

			case 'titre':
			case 'title':
			case 'titel':
			case 'title of article':
			case 'aufsatztitel':
				if (!newItem.title) {
					title = value.split(" / ");
					if (title[1]) {
						//store this to convert authors to editors. 
						//Run separate if in case we'll do this for more languages
						//this assumes title precedes author - need to make sure that's the case
						if (title[1].match(/^\s*(ed. by|edited by)/)) role = "editor";
					}
					newItem.title = title[0];
				}
				newItem.title = newItem.title.replace(/\s+:/, ":").replace(/\s*\[[^\]]+\]/g, "");
				break;

			case 'periodical':
			case 'zeitschrift':
				//for whole journals
				var journaltitle =  value.split(" / ")[0];
				break;

			case 'year':
			case 'jahr':
			case 'jaar':
				newItem.date = value.replace(/[[\]]+/g, '');
				break;

			case 'language':
			case 'langue':
			case 'sprache':
				// Language not defined in COinS
				newItem.language = value;
				break;

			case 'editeur':
			case 'published':
			case 'publisher':
			case 'ort/jahr':
			case 'uitgever':
				//ignore publisher for thesis, so that it does not overwrite university
				if (newItem.itemType == 'thesis' && newItem.university) break;

				var m = value.split(';')[0];	//hopefully publisher is always first (e.g. http://www.sudoc.fr/128661828)
				var place = m.split(':', 1)[0];
				var pub = m.substring(place.length+1); //publisher and maybe year
				if(!newItem.city) {
					place = place.replace(/[[\]]/g, '').trim();
					if(place.toUpperCase() != 'S.L.') {	//place is not unknown
						newItem.city = place;
					}
				}

				if(!newItem.publisher) {
					if(!pub) break; //not sure what this would be or look like without publisher
					pub = pub.replace(/\[.*?\]/g,'')	//drop bracketted info, which looks to be publisher role
									.split(',');
					if(pub[pub.length-1].search(/\D\d{4}\b/) != -1) {	//this is most likely year, we can drop it
						pub.pop();
					}
					if(pub.length) newItem.publisher = pub.join(',');	//in case publisher contains commas
				}

				if(!newItem.date) {	//date is always (?) last on the line
					m = value.match(/\D(\d{4})\b[^,;]*$/);	//could be something like c1986
					if(m) newItem.date = m[1];
				}
				break;

			case 'pays':
			case 'country':
			case 'land':
				if (!newItem.country) {
					newItem.country = value;
				}
				break;

			case 'description':
			case 'extent':
			case 'umfang':
			case 'omvang':
				// We're going to extract the number of pages from this field
				// Known bug doesn't work when there are 2 volumes (maybe fixed?), 
				var m = value.match(/(\d+) vol\./);
				if (m) {
					newItem.numberOfVolumes = m[1];
				}
				//make sure things like 2 partition don't match, but 2 p at the end of the field do:
				m = value.match(/\[?(\d+)\]?\s+[fpS]([^A-Za-z]|$)/);
				if (m) {
					newItem.numPages = m[1];
				}
				
				//running time for movies:
				m = value.match(/\d+\s*min/);
				if (m){
					newItem.runningTime = m[0];
				}
				break;

			case 'résumé':
			case 'abstract':
			case 'inhalt':
			case 'samenvatting':
				newItem.abstractNote = value;
				break;

			case 'notes':
			case 'note':
			case 'anmerkung':
			case 'snnotatie':
			case 'annotatie':
				newItem.notes.push({
					note: doc.evaluate('./td[@class="rec_title"]', tableRow, null, XPathResult.ANY_TYPE, null).iterateNext().innerHTML
				});
				break;

			case 'sujets':
			case 'subjects':
			case 'subject heading':
			case 'trefwoord':
			case 'schlagwörter':

				var subjects = doc.evaluate('./td[2]/div', tableRow, null, XPathResult.ANY_TYPE, null);
				//subjects on separate div lines
				if (ZU.xpath(tableRow, './td[2]/div').length > 1) {
					var subject_out = "";
					while (subject = subjects.iterateNext()) {
						var subject_content = subject.textContent;
						subject_content = subject_content.replace(/^\s*/, "");
						subject_content = subject_content.replace(/\s*$/, "");
						subject_content = subject_content.split(/\s*;\s*/)
						for (var i in subject_content) {
							if (subject_content != "") {
								newItem.tags.push(Zotero.Utilities.trimInternal(subject_content[i]));
							}
						}
					}
				} else {
					//subjects separated by newline or ; in same div.
					var subjects = value.trim().split(/\s*[;\n]\s*/)
					for (var i in subjects) {
						newItem.tags.push(Zotero.Utilities.trimInternal(subjects[i].replace(/\*/g, "")))
					}
				}
				break;

			case 'thèse':
			case 'dissertation':
				newItem.type = value.split(/ ?:/)[0];
				break;

			case "identifiant pérenne de la notice":
			case 'persistent identifier of the record':
			case 'persistent identifier des datensatzes':
				var permalink = value;	//we handle this at the end
				break;

			case 'isbn':
				var isbns = value.trim().split(/[\n,]/);
				var isbn = [], s;
				for (var i in isbns) {
					var m = isbns[i].match(/[-x\d]{10,}/i);	//this is necessary until 3.0.12
					if(!m) continue;
					if(m[0].replace(/-/g,'').search(/^(?:\d{9}|\d{12})[\dx]$/i) != -1) {
						isbn.push(m[0]);
					}
				}
				//we should eventually check for duplicates, but right now this seems fine;
				newItem.ISBN = isbn.join(", ");
				break;

			case 'worldcat':
				//SUDOC only
				var worldcatLink = doc.evaluate('./td[2]//a', tableRow, null, XPathResult.ANY_TYPE, null).iterateNext();
				if (worldcatLink) {
					newItem.attachments.push({
						url: worldcatLink.href,
						title: 'Worldcat Link',
						mimeType: 'text/html',
						snapshot: false
					});
				}
				break;
		}
	}

	//merge city & country where they're separate
	var location = [];
	if (newItem.city) location.push(newItem.city.trim());
	newItem.city = undefined;
	if (newItem.country) location.push(newItem.country.trim());
	newItem.country = undefined;
	if(location.length) newItem.place = location.join(', ');

	//if we didn't get a permalink, look for it in the entire page
	if(!permalink) {
		var permalink = ZU.xpathText(doc, '//a[./img[contains(@src,"/permalink.gif") or contains(@src,"/zitierlink.gif")]][1]/@href');
	}
	if(permalink) {
		newItem.attachments.push({
			title: 'Link to Library Catalog Entry',
			url: permalink,
			type: 'text/html',
			snapshot: false
		});
		//also add snapshot using permalink so that right-click -> View Online works
		newItem.attachments.push({
			title: 'Library Catalog Entry Snapshot',
			url: permalink,
			type: 'text/html',
			snapshot: true
		});
	} else {
		//add snapshot
		newItem.attachments.push({
			title: 'Library Catalog Entry Snapshot',
			document: doc
		});
	}

	if (!newItem.title) newItem.title = journaltitle;
	newItem.complete();
}

function doWeb(doc, url) {
	var type = detectWeb(doc, url);
	if (type == "multiple") {
		var newUrl = doc.evaluate('//base/@href', doc, null, XPathResult.ANY_TYPE, null).iterateNext().nodeValue;
		var elmts = getSearchResults(doc);
		var elmt = elmts.iterateNext();
		var links = new Array();
		var availableItems = new Array();
		do {
			var link = doc.evaluate(".//a/@href", elmt, null, XPathResult.ANY_TYPE, null).iterateNext().nodeValue;
			var searchTitle = doc.evaluate(".//a", elmt, null, XPathResult.ANY_TYPE, null).iterateNext().textContent;
			availableItems[newUrl + link] = searchTitle;
		} while (elmt = elmts.iterateNext());
		Zotero.selectItems(availableItems, function (items) {
			if (!items) {
				return true;
			}
			var uris = new Array();
			for (var i in items) {
				uris.push(i);
			}
			ZU.processDocuments(uris, scrape);
		});
	} else {
		scrape(doc, url);
	}
}
/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/CMD?ACT=SRCHA&IKT=1016&SRT=RLV&TRM=labor",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=147745608",
		"items": [
			{
				"itemType": "book",
				"creators": [
					{
						"firstName": "Jacques",
						"lastName": "Delga",
						"creatorType": "editor"
					}
				],
				"notes": [],
				"tags": [
					"Stress lié au travail -- France",
					"Harcèlement -- France",
					"Conditions de travail -- France",
					"Violence en milieu de travail",
					"Psychologie du travail"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2010",
				"ISBN": "978-2-7472-1729-3",
				"title": "Souffrance au travail dans les grandes entreprises",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"language": "français",
				"publisher": "Eska",
				"numberOfVolumes": "1",
				"numPages": "290",
				"place": "Paris, France"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=156726319",
		"items": [
			{
				"itemType": "book",
				"creators": [
					{
						"firstName": "Jason",
						"lastName": "Puckett",
						"creatorType": "author"
					}
				],
				"notes": [],
				"tags": [
					"Bibliographie -- Méthodologie -- Informatique"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2011",
				"ISBN": "978-0-83898589-2",
				"title": "Zotero: a guide for librarians, researchers and educators",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"language": "anglais",
				"publisher": "Association of College and Research Libraries",
				"numberOfVolumes": "1",
				"numPages": "159",
				"place": "Chicago, Etats-Unis",
				"shortTitle": "Zotero"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=093838956",
		"items": [
			{
				"itemType": "thesis",
				"creators": [
					{
						"firstName": "Brigitte",
						"lastName": "Lambert",
						"creatorType": "author"
					},
					{
						"firstName": "Pierre",
						"lastName": "Morel",
						"creatorType": "contributor"
					}
				],
				"notes": [
					{
						"note": "<div><span>Publication autorisée par le jury</span></div>"
					}
				],
				"tags": [
					"Leucémie lymphoïde chronique -- Thèses et écrits académiques",
					"Cellules B -- Thèses et écrits académiques",
					"Lymphome malin non hodgkinien -- Dissertations académiques",
					"Lymphocytes B -- Dissertations académiques",
					"Leucémie chronique lymphocytaire à cellules B -- Dissertations académiques"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2004",
				"title": "Facteurs pronostiques des lymphomes diffus lymphocytiques",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"university": "Université du droit et de la santé",
				"language": "français",
				"numberOfVolumes": "1",
				"numPages": "87",
				"type": "Thèse d'exercice",
				"place": "Lille, France"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=127261664",
		"items": [
			{
				"itemType": "journalArticle",
				"creators": [
					{
						"firstName": "Sirpa",
						"lastName": "Tenhunen",
						"creatorType": "author"
					}
				],
				"notes": [
					{
						"note": "<div><span>Contient un résumé en anglais et en français. - in Journal of the Royal Anthropological Institute, vol. 14, no. 3 (Septembre 2008)</span></div>"
					}
				],
				"tags": [
					"Communes rurales -- Et la technique -- Aspect social -- Inde",
					"Téléphonie mobile -- Aspect social -- Inde",
					"Inde -- Conditions sociales -- 20e siècle"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2008",
				"pages": "515-534",
				"issue": "3",
				"volume": "14",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"title": "Mobile technology in the village: ICTs, culture, and social logistics in India",
				"language": "anglais",
				"publisher": "Royal Anthropological Institute",
				"publicationTitle": "Journal of the Royal Anthropological Institute",
				"ISSN": "1359-0987",
				"place": "London, Royaume-Uni",
				"shortTitle": "Mobile technology in the village"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=128661828",
		"items": [
			{
				"itemType": "film",
				"creators": [
					{
						"firstName": "Véronique",
						"lastName": "Kleiner",
						"creatorType": "author"
					},
					{
						"firstName": "Christian",
						"lastName": "Sardet",
						"creatorType": "author"
					}
				],
				"notes": [
					{
						"note": "<div><span>Les différents films qui composent ce DVD sont réalisés avec des prises de vue réelles, ou des images microcinématographiques ou des images de synthèse, ou des images fixes tirées de livres. La bande son est essentiellement constituée de commentaires en voix off et d'interviews (les commentaires sont en anglais et les interviews sont en langue originales : anglais, français ou allemand, sous-titrée en anglais). - Discovering the cell : participation de Paul Nurse (Rockefeller university, New York), Claude Debru (ENS : Ecole normale supérieure, Paris) et Werner Franke (DKFZ : Deutsches Krebsforschungszentrum, Heidelberg) ; Membrane : participation de Kai Simons, Soizig Le Lay et Lucas Pelkmans (MPI-CBG : Max Planck institute of molecular cell biology and genetics, Dresden) ; Signals and calcium : participation de Christian Sardet et Alex Mc Dougall (CNRS / UPMC : Centre national de la recherche scientifique / Université Pierre et Marie Curie, Villefrance-sur-Mer) ; Membrane traffic : participation de Thierry Galli et Phillips Alberts (Inserm = Institut national de la santé et de la recherche médicale, Paris) ; Mitochondria : participation de Michael Duchen, Rémi Dumollard et Sean Davidson (UCL : University college of London) ; Microfilaments : participation de Cécile Gauthier Rouvière et Alexandre Philips (CNRS-CRBM : CNRS-Centre de recherche de biochimie macromoléculaire, Montpellier) ; Microtubules : participation de Johanna Höög, Philip Bastiaens et Jonne Helenius (EMBL : European molecular biology laboratory, Heidelberg) ; Centrosome : participation de Michel Bornens et Manuel Théry (CNRS-Institut Curie, Paris) ; Proteins : participation de Dino Moras et Natacha Rochel-Guiberteau (IGBMC : Institut de génétique et biologie moléculaire et cellulaire, Strasbourg) ; Nocleolus and nucleus : participation de Daniele Hernandez-Verdun, Pascal Rousset, Tanguy Lechertier (CNRS-UPMC / IJM : Institut Jacques Monod, Paris) ; The cell cycle : participation de Paul Nurse (Rockefeller university, New York) ; Mitosis and chromosomes : participation de Jan Ellenberg, Felipe Mora-Bermudez et Daniel Gerlich (EMBL, Heidelberg) ; Mitosis and spindle : participation de Eric Karsenti, Maiwen Caudron et François Nedelec (EMBL, Heidelberg) ; Cleavage : participation de Pierre Gönczy, Marie Delattre et Tu Nguyen Ngoc (Isrec : Institut suisse de recherche expérimentale sur le cancer, Lausanne) ; Cellules souches : participation de Göran Hermerén (EGE : European group on ethics in science and new technologies, Brussels) ; Cellules libres : participation de Jean-Jacques Kupiec (ENS, Paris) ; Cellules et évolution : participation de Paule Nurse (Rockefeller university, New York)</span></div><div><span>&nbsp;</span></div>"
					}
				],
				"tags": [
					"Cellules",
					"Cellules -- Évolution",
					"Membrane cellulaire",
					"Cellules -- Aspect moral",
					"Cytologie -- Recherche",
					"Biologie cellulaire",
					"Biogenèse",
					"Ultrastructure (biologie)",
					"Cells",
					"Cells -- Evolution",
					"Cell membranes",
					"Cells -- Moral and ethical aspects",
					"Cytology -- Research",
					"QH582.4"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2006",
				"ISBN": "0815342233",
				"title": "Exploring the living cell",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"language": "anglais",
				"publisher": "CNRS Images",
				"runningTime": "180 min",
				"abstractNote": "Ensemble de 20 films permettant de découvrir les protagonistes de la découverte de la théorie cellulaire, l'évolution, la diversité, la structure et le fonctionnement des cellules. Ce DVD aborde aussi en images les recherches en cours dans des laboratoires internationaux et les débats que ces découvertes sur la cellule provoquent. Les films sont regroupés en 5 chapitres complétés de fiches informatives et de liens Internet.",
				"place": "Meudon, France"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=098846663",
		"items": [
			{
				"itemType": "map",
				"creators": [],
				"notes": [],
				"tags": [
					"Météorologie maritime -- Méditerranée (mer) -- Atlas",
					"Vents -- Méditerranée (mer) -- Atlas",
					"Vent de mer -- Méditerranée (mer) -- Atlas",
					"Vagues -- Méditerranée (mer) -- Atlas",
					"Méditerranée (mer) -- Atlas"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2004",
				"ISBN": "2-11-095674-7",
				"title": "Wind and wave atlas of the Mediterranean sea",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"language": "anglais",
				"publisher": "Western European Union, Western European armaments organisation research cell"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=05625248X",
		"items": [
			{
				"itemType": "audioRecording",
				"creators": [
					{
						"firstName": "Ernest H.",
						"lastName": "Sanders",
						"creatorType": "author"
					},
					{
						"firstName": "Frank Llewellyn",
						"lastName": "Harrison",
						"creatorType": "author"
					},
					{
						"firstName": "Peter",
						"lastName": "Lefferts",
						"creatorType": "author"
					}
				],
				"notes": [
					{
						"note": "<div><span>Modern notation. - \"Critical apparatus\": p. 174-243</span></div><div><span>&nbsp;</span></div>"
					}
				],
				"tags": [
					"Messes (musique) -- Partitions",
					"Motets -- Partitions"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "1986",
				"title": "English music for mass and offices (II) and music for other ceremonies",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"language": "latin",
				"publisher": "Éditions de l'oiseau-lyre",
				"numPages": "243",
				"volume": "17",
				"series": "Polyphonic music of the fourteenth century",
				"seriesTitle": "Polyphonic music of the fourteenth century",
				"place": "Monoco, Monaco"
			}
		]
	},
	{
		"type": "web",
		"url": "http://gso.gbv.de/DB=2.1/PPNSET?PPN=732443563",
		"items": [
			{
				"itemType": "journalArticle",
				"creators": [
					{
						"firstName": "José",
						"lastName": "Borges",
						"creatorType": "author"
					},
					{
						"firstName": "António C.",
						"lastName": "Real",
						"creatorType": "author"
					},
					{
						"firstName": "J. Sarsfield",
						"lastName": "Cabral",
						"creatorType": "author"
					},
					{
						"firstName": "Gregory V.",
						"lastName": "Jones",
						"creatorType": "author"
					}
				],
				"notes": [],
				"tags": [],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"title": "A new method to obtain a consensus ranking of a region",
				"date": "2012",
				"pages": "88-107",
				"ISSN": "1931-4361",
				"issue": "1",
				"publicationTitle": "Journal of wine economics",
				"volume": "7",
				"place": "Walla Walla, Wash.",
				"publisher": "AAWE",
				"libraryCatalog": "Library Catalog - gso.gbv.de"
			}
		]
	},
	{
		"type": "web",
		"url": "http://gso.gbv.de/DB=2.1/PPNSET?PPN=731519299",
		"items": [
			{
				"itemType": "bookSection",
				"creators": [
					{
						"firstName": "Carl",
						"lastName": "Phillips",
						"creatorType": "author"
					},
					{
						"firstName": "Marion",
						"lastName": "Gibson",
						"creatorType": "editor"
					},
					{
						"firstName": "Shelley",
						"lastName": "Trower",
						"creatorType": "editor"
					},
					{
						"firstName": "Garry",
						"lastName": "Tregidga",
						"creatorType": "editor"
					}
				],
				"notes": [],
				"tags": [],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "2013",
				"pages": "70-83",
				"ISBN": "978-0-415-62868-6, 978-0-415-62869-3, 978-0-203-08018-4",
				"publicationTitle": "Mysticism myth and Celtic identity",
				"libraryCatalog": "Library Catalog - gso.gbv.de",
				"title": "'The truth against the world': spectrality and the mystic past in late twentieth-century Cornwall",
				"publisher": "Routledge ,",
				"place": "London",
				"shortTitle": "'The truth against the world'"
			}
		]
	},
	{
		"type": "web",
		"url": "http://gso.gbv.de/DB=2.1/PPNSET?PPN=729937798",
		"items": [
			{
				"itemType": "bookSection",
				"creators": [
					{
						"firstName": "Tommy",
						"lastName": "Luft",
						"creatorType": "author"
					},
					{
						"firstName": "Stefan",
						"lastName": "Ringwelski",
						"creatorType": "author"
					},
					{
						"firstName": "Ulrich",
						"lastName": "Gabbert",
						"creatorType": "author"
					},
					{
						"firstName": "Wilfried",
						"lastName": "Henze",
						"creatorType": "author"
					},
					{
						"firstName": "Helmut",
						"lastName": "Tschöke",
						"creatorType": "author"
					}
				],
				"notes": [],
				"tags": [],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"title": "Noise reduction potential of an engine oil pan",
				"date": "2013",
				"pages": "291-304",
				"ISBN": "978-3-642-33832-8",
				"journalAbbreviation": "Lecture Notes in Electrical Engineering",
				"publicationTitle": "Proceedings of the FISITA 2012 World Automotive Congress; Vol. 13: Noise, vibration and harshness (NVH)",
				"place": "Berlin",
				"publisher": "Springer Berlin",
				"libraryCatalog": "Library Catalog - gso.gbv.de",
				"seriesNumber": "201",
				"series": "Lecture notes in electrical engineering",
				"seriesTitle": "Lecture notes in electrical engineering"
			}
		]
	},
	{
		"type": "web",
		"url": "http://www.sudoc.abes.fr/DB=2.1/SRCH?IKT=12&TRM=013979922",
		"items": [
			{
				"itemType": "journalArticle",
				"creators": [
					{
						"lastName": "Organisation mondiale de la santé",
						"creatorType": "author"
					},
					{
						"lastName": "Congrès",
						"creatorType": "author"
					}
				],
				"notes": [],
				"tags": [
					"Famille -- Congrès",
					"Santé publique -- Congrès"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Worldcat Link",
						"mimeType": "text/html",
						"snapshot": false
					},
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"date": "1992-1993",
				"libraryCatalog": "Library Catalog - www.sudoc.abes.fr",
				"title": "Health promotion by the family, the role of the family in enhancing healthy behavior, symposium 23-25 March 1992, Brussels",
				"language": "français",
				"publicationTitle": "Archives belges de médecine sociale, hygiène, médecine du travail et médecine légale",
				"ISSN": "0003-9578",
				"pages": "3-232",
				"volume": "51",
				"issue": "1/4",
				"place": "Belgique"
			}
		]
	},
	{
		"type": "web",
		"url": "http://catalogue.rug.nl/DB=1/XMLPRS=Y/PPN?PPN=33112484X",
		"items": [
			{
				"itemType": "journalArticle",
				"creators": [
					{
						"firstName": "Sarah Van",
						"lastName": "Ruyskensvelde",
						"creatorType": "author"
					}
				],
				"notes": [
					{
						"note": "<div><span>Met lit. opg</span></div><div><span>Met samenvattingen in het Engels en Frans</span></div>"
					}
				],
				"tags": [
					"(GTR) Tweede Wereldoorlog",
					"(GTR) Vrijheid van onderwijs",
					"(GTR) Katholiek onderwijs",
					"(GTR) Conflicten",
					"(GTR) 4.220 België"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"libraryCatalog": "Library Catalog - catalogue.rug.nl",
				"title": "Naar een nieuwe 'onderwijsvrede': de onderhandelingen tussen kardinaal Van Roey en de Duitse bezetter over de toekomst van het vrij katholiek onderwijs, 1942-1943",
				"date": "2010",
				"publicationTitle": "Revue belge d'histoire contemporaine",
				"ISSN": "0035-0869",
				"pages": "603-643",
				"volume": "40",
				"issue": "4",
				"shortTitle": "Naar een nieuwe 'onderwijsvrede'"
			}
		]
	},
	{
		"type": "web",
		"url": "http://catalogue.rug.nl/DB=1/XMLPRS=Y/PPN?PPN=339552697",
		"items": [
			{
				"itemType": "film",
				"creators": [
					{
						"firstName": "Gustavo",
						"lastName": "Taretto",
						"creatorType": "author"
					},
					{
						"firstName": "Pilar López de",
						"lastName": "Ayala",
						"creatorType": "author"
					}
				],
				"notes": [
					{
						"note": "<div><span>Spaans gesproken, Nederlands en Frans ondertiteld</span></div>"
					}
				],
				"tags": [
					"(GTR) 7.655 Argentinië"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "Link to Library Catalog Entry",
						"type": "text/html",
						"snapshot": false
					},
					{
						"title": "Library Catalog Entry Snapshot",
						"type": "text/html",
						"snapshot": true
					}
				],
				"libraryCatalog": "Library Catalog - catalogue.rug.nl",
				"title": "Medianeras",
				"date": "2012",
				"publisher": "Homescreen",
				"runningTime": "92 min",
				"place": "Amsterdam"
			}
		]
	}
]
/** END TEST CASES **/