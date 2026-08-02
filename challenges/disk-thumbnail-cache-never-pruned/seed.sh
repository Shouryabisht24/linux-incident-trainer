#!/bin/sh
# Runs at build time as root.
#
# Break: photoapp generates a thumbnail file per photo into
# /var/cache/photoapp/thumbnails and never prunes an entry once its source
# photo is deleted. Years of accumulated orphaned thumbnails -- for photos
# that no longer exist in /srv/photoapp/photos -- have quietly filled the
# cache's bounded filesystem, and now the thumbnailer can't write new ones.
# The tmpfs itself is empty at container start, so the actual fill happens in
# the Dockerfile CMD, not here.
set -eu

mkdir -p /var/cache/photoapp/thumbnails
mkdir -p /srv/photoapp/photos

# A handful of photos that are still actually live on the site today.
for i in 1 2 3; do
  printf 'FAKEJPEGDATA-photo-%s\n' "$i" > /srv/photoapp/photos/photo${i}.jpg
done

cat > /usr/local/bin/photoapp-thumbnailer <<'EOF'
#!/bin/sh
# Usage: photoapp-thumbnailer generate <photo-id>
# Writes a small thumbnail file into the cache dir for the given photo id.
set -eu
CACHE=/var/cache/photoapp/thumbnails
case "${1:-}" in
  generate)
    id="${2:-}"
    if [ -z "$id" ]; then
      echo "usage: photoapp-thumbnailer generate <photo-id>" >&2
      exit 2
    fi
    mkdir -p "$CACHE"
    printf 'THUMB-%s\n' "$id" > "$CACHE/thumb-${id}.jpg"
    echo "generated $CACHE/thumb-${id}.jpg"
    ;;
  *)
    echo "usage: photoapp-thumbnailer generate <photo-id>" >&2
    exit 2
    ;;
esac
EOF
chmod +x /usr/local/bin/photoapp-thumbnailer
