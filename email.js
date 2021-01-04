/*
Sends emails & renders templates.


Packages required:
+ postmark
+ mailgun-js
+ @sendgrid/mail
+ glob
+ path
+ fs (inbuilt)
+ ejs
+ juice
+ html-to-text
+ html-minifier

*/


/********************************************* CONFIGURATION **********************************************/


const defaultFrom = "Jamie <hello@jamie.no>"





/********************************************* SETUP FUNCTIONS **********************************************/


//Load required packages.
const Postmark = require("postmark")
const Mailgun = require("mailgun-js")
const Sendgrid = require("@sendgrid/mail").MailService
const glob = require("glob")
const path = require("path")
const fs = require("fs")
const ejs = require("ejs")
const juice = require("juice")
const htmlToText = require("html-to-text")
const minify = require("html-minifier").minify


//Export primary function.
module.exports = Email





/********************************************* PRIMARY FUNCTIONS **********************************************/


/*
The emails function.
*/
function Email(options = {}) {
  if(!(this instanceof Email)) { return new Email(options) }


  /********************* CLIENT SETUP *********************/


  //Setup email client.
  if(!options.from) { options.from = defaultFrom }
  else if(!options.from.includes("<") && options.name) { options.from = options.name + " <" + options.from + ">" }

  if(!["postmark", "sendgrid", "mailgun"].includes(options.service)) { throw new Error("Unknown email service: " + options.service) }
  if(!options.key) { throw new Error("An API key is required for sending emails with " + options.service) }

  if(options.service == "postmark") {
    var emailClient = new Postmark.Client(options.key)
  }
  else if(options.service == "sendgrid") {
    var emailClient = new Sendgrid()
    emailClient.setApiKey(options.key)
  }
  else if(options.service == "mailgun") {
    if(!options.domain) { throw new Error("A domain is required for sending emails with MailGun.") }
    var emailClient = Mailgun({apiKey: options.key, domain: options.domain})
  }





  /********************* TEMPLATING *********************/


  if(options.templates) {
    options.templates = path.resolve(options.templates)

    //Load all files & turn them into a template.
    var files = glob.sync(path.join(options.templates, "/**/*"))
    for(var i in files) {
      if(fs.lstatSync(files[i]).isDirectory() || !files[i].includes(".ejs")) { continue }
      var file = files[i], name = file.replace(options.templates, "").replace(".ejs", "").replace(".html", "")
      if(name[0] == "/") { name = name.substring(1) }

      var template = ejs.compile(fs.readFileSync(file, "utf8"), {async: true, filename: file, root: options.templates})

      this[name] = function(preCompiled) {
        var compiled = preCompiled
        return async function(to, subject, vars = {}, custom = {}) {
          var html = await compiled(vars)
          return await email(to, subject, html, custom.text || undefined, custom)
        }
      }(template)

    }

  }





  /********************* EMAIL SENDER FUNCTION *********************/


  /*
  Sends an email.
  */
  this.email = async function(to, subject, html, text, custom = {}) {
    if(html) {
      html = juice(html, {preserveMediaQueries: true})
      if(!text && !custom.disableAutoText) { text = htmlToText.fromString(html) }
      if(!custom.disableMinify) { html = minify(html, {collapseWhitespace: true, minifyCSS: true, minifyJS: false, removeComments: true, removeRedundantAttributes: true}) }
    }

    if(options.service == "postmark") {
      var data = {From: custom.from || options.from, ReplyTo: custom.replyTo || options.replyTo || options.from, To: to, Subject: subject, HtmlBody: html, TextBody: text}
      await emailClient.sendEmail(data)
    }
    else if(options.service == "sendgrid") {
      var data = {from: custom.from || options.from, replyTo: custom.replyTo || options.replyTo || options.from, to: to, subject: subject, text: text, html: html}
      await emailClient.send(data)
    }
    else if(options.service == "mailgun") {
      var data = {from: custom.from || options.from, "h:Reply-To": custom.replyTo || options.replyTo || options.from, to: to, subject: subject, text: text, html: html}
      await emailClient.messages().send(data)
    }

    return true
  }
  var email = this.email

}
