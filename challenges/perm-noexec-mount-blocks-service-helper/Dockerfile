FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
# /opt/render-assets is a noexec tmpfs, empty at container start (see
# challenge.json "tmpfs") -- write the actual helper there at runtime, not
# build time, matching the AUTHORING.md tmpfs-is-empty-at-start rule.
CMD ["sh", "-c", "mkdir -p /opt/render-assets && printf '#!/bin/sh\\necho RENDER_OK\\n' > /opt/render-assets/render-helper.sh && chmod +x /opt/render-assets/render-helper.sh && exec sleep infinity"]
