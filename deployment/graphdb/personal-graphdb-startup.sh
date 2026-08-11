#!/bin/sh
set -eu

graphdb_image='ontotext/graphdb@sha256:e66ad4c6cbec16bb209735d4f777c97bab8c508cdd7709d916abe854612052d3'
graphdb_home='/var/lib/music-kg-graphdb'
config_path='/opt/music-kg/personal-repository-config.ttl'

apt-get update
apt-get install --yes docker.io curl
systemctl enable --now docker
install --directory --mode=0750 "$graphdb_home" /opt/music-kg
curl --fail --silent --show-error \
  --header 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/attributes/personal-repository-config' \
  --output "$config_path"

docker rm --force music-kg-personal-graphdb >/dev/null 2>&1 || true
docker run --detach --name music-kg-personal-graphdb --restart unless-stopped \
  --publish 7200:7200 --env GDB_HEAP_SIZE=2g \
  --volume "$graphdb_home:/opt/graphdb/home" "$graphdb_image"

until curl --fail --silent --show-error http://127.0.0.1:7200/rest/repositories >/dev/null; do
  sleep 2
done

if ! curl --fail --silent http://127.0.0.1:7200/rest/repositories | grep -q '"id":"music-kg-personal"'; then
  curl --fail --silent --show-error --request POST \
    --form "config=@$config_path" http://127.0.0.1:7200/rest/repositories
fi
