# diff capture

```
$ cp config.json.dist config.json
$ yarn
$ yarn run start
```

You can get capture files in `screenshot` dirctory and check diff between `prod` screenshot and `dev` screenshot.

* `${projectname}/dev/${date}/${filename}.png`
* `${projectname}/prod/${date}/${filename}.png`
* `${projectname}/diff/${date}/${filename}.png`
