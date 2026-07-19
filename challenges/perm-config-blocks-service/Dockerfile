FROM debian:12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx curl procps sudo && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh

# Bake the break into the image at build time (see decisions/0002-*).
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
CMD ["sleep", "infinity"]
