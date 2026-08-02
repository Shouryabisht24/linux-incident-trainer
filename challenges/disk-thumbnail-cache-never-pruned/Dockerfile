FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils findutils && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
# /var/cache/photoapp/thumbnails is a size-bounded tmpfs, empty at container
# start (see challenge.json "tmpfs"). Fill it here, at runtime, with
# thousands of small orphaned thumbnail files -- thumbnails for photos that
# were deleted from the site long ago but whose cached thumbnails were never
# cleaned up -- until the tmpfs is genuinely full.
CMD ["sh","-c","mkdir -p /var/cache/photoapp/thumbnails && chmod 1777 /var/cache/photoapp/thumbnails; i=0; while dd if=/dev/zero of=/var/cache/photoapp/thumbnails/thumb-orphan-$i.jpg bs=1024 count=20 2>/dev/null; do i=$((i+1)); done; chmod -R 666 /var/cache/photoapp/thumbnails/* 2>/dev/null; exec sleep infinity"]
