FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends sudo procps coreutils && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash trainee && \
    echo "trainee ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

COPY seed.sh /usr/local/bin/seed.sh
COPY check.sh /usr/local/bin/check.sh
RUN chmod +x /usr/local/bin/seed.sh /usr/local/bin/check.sh
RUN /usr/local/bin/seed.sh

WORKDIR /home/trainee
# /var/lib/eventqueue is a size-bounded (24MB) tmpfs, empty at container
# start (see challenge.json "tmpfs"). Write the stale WAL reservation here, at
# runtime, so it lands against the real tmpfs rather than the build-time
# image layer -- simulating a broker that lost power mid-run and never got to
# clean up (or release) the disk space it had reserved for its write-ahead
# log. The leftover is sized 20MB -- larger than the 13MB a fresh instance
# reserves on a clean start (an old, larger WAL segment size from before a
# tuning change) -- so simply restarting without removing it leaves no room
# for a fresh reservation, and the box is left with well under the healthy
# threshold check.sh expects.
CMD ["sh","-c","mkdir -p /var/lib/eventqueue && chmod 1777 /var/lib/eventqueue && dd if=/dev/zero of=/var/lib/eventqueue/wal.reserved bs=1M count=20 2>/dev/null; chmod 666 /var/lib/eventqueue/wal.reserved 2>/dev/null; exec sleep infinity"]
