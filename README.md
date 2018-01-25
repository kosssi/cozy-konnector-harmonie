[Cozy][cozy] Harmonie
=======================================

What's Cozy?
------------

![Cozy Logo](https://cdn.rawgit.com/cozy/cozy-guidelines/master/templates/cozy_logo_small.svg)

[Cozy] is a platform that brings all your web services in the same private space. With it, your webapps and your devices can share data easily, providing you with a new experience. You can install Cozy on your own hardware where no one's tracking you.

What's this konnector?
--------------------------

This konnector fetches the list of reimbursements from [Harmonie Mutuelle][harmonie].

What data is imported ?
-----------------------

This konnector imports the list of reimbursements metadata that you can see in the "Mes remboursements" page.
It uses the detailed view for each line.

For each reimbursement, an associated PDF bill is downloaded (many reimbursements can have the
same associated file and the file is only downloaded once.

Each health care treatment has its own document in io.cozy.bills to allow the linking with the original debit operation.
But Harmonie can reimburse multiple health care treatments at once sometimes. And, for now, there is
no matching of credit operation in this case.

An example of imported data can be seen in [./importedData.json](./importedData.json)

Take a look at the [documentation](https://github.com/cozy/cozy-doctypes/blob/master/docs/io.cozy.bills.md)
to have the signification of the fields in this file.

### TODO

- [ ] Merge multiple bills with the same id of reimbursement and sum originalAmount of each
bill to get the real originalAmount of the related credit operation

### Open a Pull-Request

If you want to work on this konnector and submit code modifications, feel free to open pull-requests! See the [contributing guide][contribute] for more information about how to properly open pull-requests.

### Run

If you have a running accessible cozy-stack you can test your modifications to the konnector without installing
and/or updating the konnector in the cozy-stack :

You first need an installed [nodejs] (LTS version is fine).

Then just run (but you have to have proper COZY_CREDENTIALS, COZY_URL and COZY_FIELDS environment variables):

```sh
npm install
npm start
```
### Test

If you do not want to have to install the konnector on a cozy v3 to test it, you can register the
konnector as an OAuth application with the following commands :

```sh
npm install
npm run dev
```

This command will register your konnector as an OAuth application to the cozy-stack. By default,
the cozy-stack is supposed to be located in http://cozy.tools:8080. If this is not your case, just
update the COZY_URL field in [./data/env.js].

After that, your konnector is running but should not work since you did not specify any credentials to
the target service. You can also do this in [./data/env.js] by modifying the COZY_FIELDS attribute
which is a JSON string.

Now run `npm run dev` one more time, it should be ok.

### Hack

If you do not want to need to have an accessible cozy-stack, just run :

```sh
npm install
npm run standalone
```

The requests to the cozy-stack will be stubbed using the [./data/fixture.json] file as source of data
and when cozy-client is asked to create or update data, the data will be outputed to the console.
The bills (or any file) will be saved in the ./data directory.

### Maintainer

The lead maintainers for this konnector is @ptbrowne.


### Get in touch

You can reach the Cozy Community by:

- Chatting with us on IRC [#cozycloud on Freenode][freenode]
- Posting on our [Forum]
- Posting issues on the [Github repos][github]
- Say Hi! on [Twitter]


License
-------

Harmonie Konnector is developed by Cozy Cloud and distributed under the [AGPL v3 license][agpl-3.0].

[cozy]: https://cozy.io "Cozy Cloud"
[agpl-3.0]: https://www.gnu.org/licenses/agpl-3.0.html
[freenode]: http://webchat.freenode.net/?randomnick=1&channels=%23cozycloud&uio=d4
[forum]: https://forum.cozy.io/
[github]: https://github.com/cozy/
[nodejs]: https://nodejs.org/
[twitter]: https://twitter.com/mycozycloud
[harmonie]: https://www.harmonie-mutuelle.fr
