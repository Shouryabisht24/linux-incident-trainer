FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps util-linux lsof psmisc && \
    rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh
WORKDIR /home/trainee
# A hung package-manager invocation from an interrupted maintenance window,
# still sitting on dpkg's frontend lock. Has to be a real running process at
# container start (a lock file alone with nobody holding it blocks nothing --
# see seed.sh), so it's launched here, not baked into the image.
CMD ["sh","-c","nohup flock -x /var/lib/dpkg/lock-frontend sleep infinity >/dev/null 2>&1 & exec sleep infinity"]
